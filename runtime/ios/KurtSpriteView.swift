// SPDX-License-Identifier: AGPL-3.0-only
import UIKit

@MainActor enum KurtTouchGate {
    static var until: TimeInterval = 0
    static var holding = false
    static var engaged: Bool { holding || ProcessInfo.processInfo.systemUptime < until }
    static func touch() { until = ProcessInfo.processInfo.systemUptime + 0.5 }
}

enum KurtContact: String { case pet, treat }

/// Remember the furthest movement, including a stroke returning to its origin.
struct KurtContactStroke {
    let start: CGPoint
    private(set) var stroked = false
    private(set) var carried = false
    static let holdDuration = 0.55
    mutating func hold(for seconds: TimeInterval) -> Bool {
        guard !stroked, !carried, seconds >= Self.holdDuration else { return false }
        carried = true
        return true
    }
    mutating func move(to point: CGPoint) -> KurtContact? {
        guard !stroked, !carried, hypot(point.x - start.x, point.y - start.y) >= 12 else { return nil }
        stroked = true
        return .pet
    }
    var ended: KurtContact? { stroked || carried ? nil : .treat }
}

final class KurtSpriteView: UIView {
    private let actor = CALayer()
    private let fallingWaste = CALayer()
    private var drops: [String: CGImage] = [:]
    private let shadow = CAShapeLayer()
    private var pages: [Int: CGImage] = [:]
    private var root: URL?
    private var manifest: KurtAtlasManifest?
    private var displayLink: CADisplayLink?
    private var clockTarget: KurtClockTarget?
    private var lastTick: CFTimeInterval?
    private var elapsed = 0.0
    private var range = 0...0
    private var motionFrames: [KurtFrame]?
    private var depositFrame: Int?
    private var deposited = false
    private var swallowFrame: Int?
    private var swallowed = false
    private var loopRange: ClosedRange<Int>?
    private var tailStart: Int?
    private var tailNotified = false
    private var generation = 0
    private(set) var isAmbient = false
    var petting = false
    private var placement: KurtFrame?
    private var carryPoint: CGPoint?
    private var carryOffset = CGPoint.zero
    private var carryTime = 0.0
    private(set) var frameIndex = 0
    private(set) var contactRect = CGRect.zero
    var playbackRate = 1.0
    var roomSize = CGSize(width: 3392, height: 2400)
    var seatFront: [KurtPoint] = []
    var seatFronts: [[KurtPoint]] = []
    var imageFrame: CGRect?
    var exclusions: [CGRect] = []
    var viewportLimited = false
    var onViewport: (() -> Void)?
    private var oldBounds = CGRect.zero
    var projection: KurtProjection { imageFrame.map { KurtProjection(frame: $0) } ?? KurtProjection(image: roomSize, canvas: bounds.size) }
    var visibleImage: CGRect {
        guard viewportLimited else { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        let a = projection.normalized(.zero), b = projection.normalized(CGPoint(x: bounds.maxX, y: bounds.maxY))
        return CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y)
    }
    func availableForExit(_ frame: KurtFrame) -> Bool {
        guard viewportLimited else { return true }
        let body = frame.bodyBounds, p = projection.position(.init(x: body.minX, y: body.minY))
        let rect = CGRect(x: p.x, y: p.y, width: body.width * projection.frame.width, height: body.height * projection.frame.height)
        // The lower navigation strip occludes the walk out. Other controls
        // remain obstacles, as do the left, right and upper viewport edges.
        return rect.minX >= 0 && rect.maxX <= bounds.maxX && rect.minY >= 0
            && !exclusions.filter { $0.maxY < bounds.maxY - 1 || $0.height > bounds.height * 0.25 }.contains { $0.intersects(rect) }
    }
    func available(_ frame: KurtFrame) -> Bool {
        guard viewportLimited else { return true }
        let body = frame.bodyBounds, p = projection.position(.init(x: body.minX, y: body.minY))
        let rect = CGRect(x: p.x, y: p.y, width: body.width * projection.frame.width, height: body.height * projection.frame.height).insetBy(dx: -4, dy: -4)
        return bounds.contains(rect) && !exclusions.contains(where: { $0.intersects(rect) })
    }
    var acceptsContact = false
    var onContact: ((KurtContact) -> Void)?
    var onFrame: ((Int) -> Void)?
    var onDeposit: (() -> Void)?
    var onSwallow: (() -> Void)?
    var onPetting: ((Bool) -> Void)?
    var onTail: (() -> Void)?
    var onStop: (() -> Void)?
    var onPendingTouch: ((Bool) -> Void)?
    var onPickup: ((CGPoint) -> Void)?
    var onCarryEnd: ((CGPoint, Bool) -> Void)?
    private lazy var contactGesture = KurtContactGesture(target: self, action: #selector(contactChanged(_:)))

    var currentFrame: KurtFrame? {
        if let motionFrames, motionFrames.indices.contains(frameIndex - range.lowerBound) { return carried(motionFrames[frameIndex - range.lowerBound]) }
        guard let manifest, manifest.frames.indices.contains(frameIndex) else { return nil }
        let frame = manifest.frames[frameIndex]
        return carried(placement.map { frame.placed(at: $0) } ?? frame)
    }
    private func carried(_ source: KurtFrame) -> KurtFrame {
        guard let pointer = carryPoint, let manifest else { return source }
        var frame = source
        let grip = frame.grip ?? KurtPoint(x: 0.54, y: 0.34)
        let t = min(1, carryTime / 0.5), remaining = 1 - t * t * (3 - 2 * t)
        let gripPoint = CGPoint(x: pointer.x + carryOffset.x * remaining, y: pointer.y + carryOffset.y * remaining)
        let spriteScale = projection.frame.width * manifest.sourceSize / manifest.bodyWidth
        frame.width = KurtMotion.carriedWidth(
            gripDepth: (gripPoint.y - projection.frame.minY) / projection.frame.height,
            footOffsetPerWidth: (manifest.anchor.y - grip.y) * spriteScale / projection.frame.height)
        let size = frame.width * spriteScale
        let foot = CGPoint(x: gripPoint.x + (manifest.anchor.x - grip.x) * size * (frame.facing ?? -1),
                           y: gripPoint.y + (manifest.anchor.y - grip.y) * size)
        frame.x = (foot.x - projection.frame.minX) / projection.frame.width
        frame.y = (foot.y - projection.frame.minY) / projection.frame.height
        frame.lift = 0; frame.support = "air"
        return frame
    }
    func beginCarrying(at point: CGPoint, animated: Bool = true) {
        guard let frame = currentFrame, let manifest else { return }
        let foot = projection.position(.init(x: frame.x, y: frame.y - frame.lift))
        let size = frame.width * projection.frame.width * manifest.sourceSize / manifest.bodyWidth
        let grip = frame.grip ?? KurtPoint(x: 0.54, y: 0.34)
        carryOffset = CGPoint(x: foot.x + (grip.x - manifest.anchor.x) * size * (frame.facing ?? -1) - point.x,
                              y: foot.y + (grip.y - manifest.anchor.y) * size - point.y)
        carryTime = animated ? 0 : 0.5; carryPoint = point
    }
    func moveCarrying(to point: CGPoint) { carryPoint = carryPoint == nil ? nil : point; drawFrame() }
    func endCarrying() { carryPoint = nil; carryOffset = .zero; carryTime = 0 }
    var isRunning: Bool { displayLink != nil }

    var minimumTouchSize: CGFloat = 44
    var shadowColor: CGColor = UIColor.black.cgColor { didSet { shadow.fillColor = shadowColor } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        shadow.fillColor = shadowColor
        actor.contentsGravity = .resize
        actor.magnificationFilter = .linear
        actor.minificationFilter = .linear
        layer.addSublayer(shadow)
        fallingWaste.anchorPoint = CGPoint(x: 0.5, y: 1)
        fallingWaste.contentsGravity = .resize
        layer.addSublayer(fallingWaste)
        layer.addSublayer(actor)
        addGestureRecognizer(contactGesture)
        contactGesture.onPending = { [weak self] in self?.onPendingTouch?($0) }
        accessibilityLabel = "Kurt"
        accessibilityHint = "Antippen gibt ein Leckerli. Wischen streichelt ihn. Ruhig gedrückt halten hebt ihn zum Versetzen an."
        accessibilityTraits = .button
        accessibilityCustomActions = [
            UIAccessibilityCustomAction(name: "Streicheln", target: self, selector: #selector(accessiblePet)),
            UIAccessibilityCustomAction(name: "Leckerli geben", target: self, selector: #selector(accessibleTreat))
        ]
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    deinit { displayLink?.invalidate() }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        // The recognizer exists only on Kurt's hit area. Everywhere else it
        // never receives a touch and the enclosing screen scrolls normally.
        var ancestor = superview
        while let view = ancestor {
            if let scroll = view as? UIScrollView { scroll.panGestureRecognizer.require(toFail: contactGesture) }
            ancestor = view.superview
        }
    }
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        guard acceptsContact, manifest != nil, contactRect.contains(point), bounds.contains(point), !exclusions.contains(where: { $0.contains(point) }) else { return false }
        if currentFrame?.support == "seat" {
            if (seatFronts.isEmpty ? [seatFront] : seatFronts).contains(where: { KurtGeometry.contains($0, projection.normalized(point)) }) { return false }
        }
        return true
    }
    override var accessibilityFrame: CGRect {
        get { UIAccessibility.convertToScreenCoordinates(contactRect, in: self) }
        set { super.accessibilityFrame = newValue }
    }
    override func accessibilityActivate() -> Bool { sendContact(.treat) }
    @objc private func accessiblePet() -> Bool { sendContact(.pet) }
    @objc private func accessibleTreat() -> Bool { sendContact(.treat) }
    @discardableResult private func sendContact(_ contact: KurtContact) -> Bool {
        guard acceptsContact, manifest != nil else { return false }
        onContact?(contact)
        return true
    }
    @objc private func contactChanged(_ gesture: KurtContactGesture) {
        KurtTouchGate.touch()
        switch gesture.state {
        case .began:
            if gesture.wasCarry { onPickup?(gesture.contactPoint) }
            else if gesture.wasStroke { onPetting?(true) }
        case .changed:
            if gesture.wasCarry { moveCarrying(to: gesture.contactPoint) }
            else if gesture.wasStroke { onPetting?(true) }
        case .ended:
            if gesture.wasCarry { onCarryEnd?(gesture.contactPoint, false) }
            else { onPetting?(false); if !gesture.wasStroke { sendContact(.treat) } }
        case .cancelled, .failed:
            if gesture.wasCarry { onCarryEnd?(gesture.contactPoint, true) }
            else { onPetting?(false) }
        default: break
        }
    }

    func load(_ manifest: KurtAtlasManifest, root: URL) -> Bool {
        unload()
        guard !manifest.frames.isEmpty, manifest.pages.allSatisfy({ FileManager.default.fileExists(atPath: root.appendingPathComponent($0).path) }) else { return false }
        self.manifest = manifest
        self.root = root
        actor.anchorPoint = CGPoint(x: manifest.anchor.x, y: manifest.anchor.y)
        actor.setAffineTransform(CGAffineTransform(scaleX: -1, y: 1))
        isAccessibilityElement = true
        seek(0)
        return actor.contents != nil
    }
    func unload() {
        contactGesture.isEnabled = false; contactGesture.isEnabled = true
        endCarrying()
        pause()
        generation += 1; petting = false; loopRange = nil; tailStart = nil; isAmbient = false
        manifest = nil
        root = nil
        placement = nil
        motionFrames = nil
        pages.removeAll()
        actor.contents = nil
        fallingWaste.contents = nil; drops.removeAll()
        shadow.path = nil
        contactRect = .zero
        isAccessibilityElement = false
    }
    func seek(_ frame: Int) {
        guard let manifest else { return }
        pause()
        generation += 1; loopRange = nil; tailStart = nil; isAmbient = false
        placement = nil
        motionFrames = nil
        swallowFrame = nil
        frameIndex = min(max(frame, 0), manifest.routeFrameCount - 1)
        range = frameIndex...(manifest.routeFrameCount - 1)
        elapsed = 0
        drawFrame()
        onFrame?(frameIndex)
    }
    func hold(_ frame: Int, at placement: KurtFrame) {
        guard let manifest, manifest.frames.indices.contains(frame) else { return }
        pause()
        generation += 1; loopRange = nil; tailStart = nil; isAmbient = false
        self.placement = placement
        motionFrames = nil
        swallowFrame = nil; depositFrame = nil
        frameIndex = frame; range = frame...frame; elapsed = 0
        drawFrame(); onFrame?(frameIndex)
    }
    func play(_ sequence: KurtSequence, at placement: KurtFrame? = nil, frames: [KurtFrame]? = nil) {
        guard let manifest, sequence.first >= 0, sequence.last < manifest.frames.count else { return }
        pause()
        generation += 1
        isAmbient = sequence.ambient == true
        loopRange = sequence.loopStart.flatMap { start in sequence.loopEnd.map { start...$0 } }
        tailStart = sequence.tailStart; tailNotified = false
        self.placement = placement
        motionFrames = frames
        depositFrame = sequence.deposit
        deposited = false
        range = sequence.first...(sequence.first + (frames?.count ?? sequence.count) - 1)
        swallowFrame = sequence.swallow
        swallowed = false
        elapsed = 0
        frameIndex = range.lowerBound
        drawFrame()
        onFrame?(frameIndex)
        resume()
    }
    func finishRoute(at frame: Int) {
        guard let manifest, frameIndex < manifest.routeFrameCount else { return }
        play(KurtSequence(id: "settle", first: frameIndex, count: max(1, frame - frameIndex + 1), swallow: nil))
    }
    func resume() {
        guard manifest != nil, displayLink == nil else { return }
        lastTick = nil
        let target = KurtClockTarget(owner: self)
        let link = CADisplayLink(target: target, selector: #selector(KurtClockTarget.tick(_:)))
        link.preferredFramesPerSecond = 12
        clockTarget = target
        displayLink = link
        link.add(to: .main, forMode: .common)
    }
    func pause() {
        displayLink?.invalidate()
        displayLink = nil
        clockTarget = nil
        lastTick = nil
    }
    fileprivate func tick(_ timestamp: CFTimeInterval) {
        let delta = lastTick.map { max(0, timestamp - $0) } ?? 0
        lastTick = timestamp
        advance(by: delta)
    }
    /// Same clock entry for live display and deterministic contact tests.
    func advance(by delta: TimeInterval) {
        guard let manifest, isRunning, delta.isFinite, delta >= 0 else { return }
        let playingGeneration = generation
        elapsed += delta * playbackRate
        if carryPoint != nil { carryTime += delta }
        if isAmbient { elapsed.formTruncatingRemainder(dividingBy: Double(range.count) / manifest.fps) }
        if petting, let loopRange {
            let absolute = range.lowerBound + Int(floor(elapsed * manifest.fps + 1e-6))
            if absolute > loopRange.upperBound {
                let cycles = (absolute - loopRange.lowerBound) / loopRange.count
                elapsed -= Double(cycles * loopRange.count) / manifest.fps
            }
        }
        let next = min(range.upperBound, range.lowerBound + Int(floor(elapsed * manifest.fps + 1e-6)))
        if next != frameIndex {
            frameIndex = next
            drawFrame()
            onFrame?(next)
        } else if carryPoint != nil { drawFrame() }
        guard generation == playingGeneration else { return }
        if let swallowFrame, !swallowed, next >= swallowFrame {
            swallowed = true
            onSwallow?()
        }
        guard generation == playingGeneration else { return }
        if let depositFrame, !deposited, next >= depositFrame { deposited = true; onDeposit?() }
        if let tailStart, !tailNotified, next >= tailStart {
            tailNotified = true
            onTail?()
        }
        guard generation == playingGeneration else { return }
        if !isAmbient, elapsed >= Double(range.count) / manifest.fps {
            pause()
            onStop?()
        }
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        drawFrame()
        if oldBounds != bounds { oldBounds = bounds; onViewport?() }
    }
    private func drawFrame() {
        guard let manifest, let frame = currentFrame, let root else { return }
        if pages[frame.page] == nil {
            // At most two decoded pages even as the clip library grows.
            if pages.count >= 2 { pages.removeAll() }
            pages[frame.page] = UIImage(contentsOfFile: root.appendingPathComponent(manifest.pages[frame.page]).path)?.cgImage
        }
        let foot = projection.position(.init(x: frame.x, y: frame.y - frame.lift))
        let contact = projection.position(.init(x: frame.x, y: frame.y))
        let bodyWidth = frame.width * projection.frame.width
        let size = bodyWidth * manifest.sourceSize / manifest.bodyWidth
        let unit = 1 / Double(manifest.columns)
        let body = frame.bodyBounds
        let top = projection.position(.init(x: body.minX, y: body.minY))
        let raw = CGRect(x: top.x, y: top.y, width: body.width * projection.frame.width, height: body.height * projection.frame.height)
        contactRect = raw.insetBy(dx: -max(0, (minimumTouchSize - raw.width) / 2), dy: -max(0, (minimumTouchSize - raw.height) / 2))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        actor.setAffineTransform(CGAffineTransform(scaleX: frame.facing ?? -1, y: 1))
        actor.contents = pages[frame.page]
        actor.contentsRect = CGRect(x: Double(frame.column) * unit, y: Double(frame.row) * unit, width: unit, height: unit)
        actor.bounds = CGRect(x: 0, y: 0, width: size, height: size)
        actor.position = foot
        if let effect = frame.falling {
            if drops[effect.kind] == nil {
                drops[effect.kind] = UIImage(contentsOfFile: root.appendingPathComponent(effect.kind + "-drop.png").path)?.cgImage
            }
            let direction = (frame.facing ?? -1) < 0 ? 1.0 : -1.0
            fallingWaste.contents = drops[effect.kind]
            fallingWaste.isHidden = false
            fallingWaste.setAffineTransform(CGAffineTransform(scaleX: direction, y: 1))
            fallingWaste.bounds = CGRect(x: 0, y: 0, width: effect.width * bodyWidth * KurtWaste.artworkScale,
                                         height: effect.height * bodyWidth * KurtWaste.artworkScale)
            fallingWaste.position = CGPoint(x: foot.x + effect.x * bodyWidth * direction, y: foot.y + effect.y * bodyWidth)
        } else { fallingWaste.isHidden = true }
        shadow.path = CGPath(ellipseIn: CGRect(x: contact.x - bodyWidth * 0.36, y: contact.y - bodyWidth * 0.042,
                                              width: bodyWidth * 0.72, height: bodyWidth * 0.084), transform: nil)
        shadow.opacity = Float(0.13 * (1 - min(1, frame.lift / 0.1) * 0.55))
        shadow.isHidden = carryPoint != nil
        CATransaction.commit()
    }
}

private final class KurtContactGesture: UIGestureRecognizer {
    private var stroke: KurtContactStroke?
    private(set) var wasStroke = false
    private(set) var wasCarry = false
    private(set) var contactPoint = CGPoint.zero
    var onPending: ((Bool) -> Void)?
    private var holdTimer: Timer?
    private func finishPending() { holdTimer?.invalidate(); holdTimer = nil; onPending?(false) }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        guard stroke == nil, touches.count == 1, let touch = touches.first else {
            state = state == .possible ? .failed : .cancelled
            return
        }
        KurtTouchGate.touch()
        KurtTouchGate.holding = true
        contactPoint = touch.location(in: view)
        stroke = KurtContactStroke(start: contactPoint)
        onPending?(true)
        let timer = Timer(timeInterval: KurtContactStroke.holdDuration, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.state == .possible, self.stroke?.hold(for: KurtContactStroke.holdDuration) == true else { return }
                self.wasCarry = true; self.finishPending(); self.state = .began
            }
        }
        holdTimer = timer; RunLoop.main.add(timer, forMode: .common)
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let touch = touches.first else { return }
        KurtTouchGate.touch()
        contactPoint = touch.location(in: view)
        if stroke?.move(to: contactPoint) == .pet {
            wasStroke = true
            finishPending()
            state = .began
        } else if wasStroke || wasCarry { state = .changed }
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        if let touch = touches.first { contactPoint = touch.location(in: view) }
        if stroke?.move(to: contactPoint) == .pet {
            wasStroke = true
            state = .began
        }
        finishPending(); KurtTouchGate.holding = false
        KurtTouchGate.touch()
        state = .ended
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        finishPending(); KurtTouchGate.holding = false; state = .cancelled
    }
    override func reset() {
        finishPending(); KurtTouchGate.holding = false
        stroke = nil; wasStroke = false; wasCarry = false
    }
}

private final class KurtClockTarget: NSObject {
    weak var owner: KurtSpriteView?
    init(owner: KurtSpriteView) { self.owner = owner }
    @objc func tick(_ link: CADisplayLink) { owner?.tick(link.timestamp) }
}
