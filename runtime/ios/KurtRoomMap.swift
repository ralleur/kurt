// SPDX-License-Identifier: AGPL-3.0-only
import Foundation
import CoreGraphics

struct KurtPoint: Codable, Hashable { var x: Double; var y: Double }
struct KurtRegion: Codable, Hashable { var kind: String; var points: [KurtPoint] }

struct KurtAtlasManifest: Decodable {
    var version: String
    var fps: Double
    var duration: Double
    var cell: Int
    var columns: Int
    var sourceSize: Double
    var bodyWidth: Double
    var anchor: KurtPoint
    var pages: [String]
    var frames: [KurtFrame]
    var routeFrameCount: Int
    var sequences: [KurtSequence]
    func sequence(_ id: String) -> KurtSequence? { sequences.first { $0.id == id } }
}

struct KurtSequence: Decodable {
    var id: String
    var first: Int
    var count: Int
    var swallow: Int?
    var deposit: Int? = nil
    var distance: Double? = nil
    var loopStart: Int? = nil
    var loopEnd: Int? = nil
    var tailStart: Int? = nil
    var ambient: Bool? = nil
    var last: Int { first + count - 1 }
}

struct KurtFallingWaste: Decodable {
    var kind: String
    var x: Double
    var y: Double
    var width: Double
    var height: Double
}

struct KurtFrame: Decodable {
    var index: Int
    var page: Int
    var column: Int
    var row: Int
    var time: Double
    var clip: String
    var label: String
    var x: Double
    var y: Double
    var lift: Double
    var width: Double
    var support: String
    var facing: Double? = nil
    /// Distance progress paired with the exported contact drawing.
    var travel: Double? = nil
    var falling: KurtFallingWaste? = nil
    /// Registered nape point for hand-drawn carrying cels, in texture units.
    var grip: KurtPoint? = nil
    /// Pupil offset baked into idle cels, independent of head movement.
    var gaze: KurtPoint? = nil

    func placed(at origin: KurtFrame) -> KurtFrame {
        var copy = self
        copy.x = origin.x; copy.y = origin.y; copy.width = origin.width; copy.facing = origin.facing
        // A pose can rest on either surface; its original atlas location is
        // only the study staging. Jump routes assign their own air/support.
        copy.support = origin.support
        return copy
    }

    /// Includes the entire supporting footprint, not just the root point.
    var footprint: CGRect {
        CGRect(x: x - width / 2, y: y - width * 0.18, width: width, height: width * 0.23)
    }

    /// Conservative envelope of the drawn body, including jump and squash.
    var bodyBounds: CGRect {
        CGRect(x: x - width * 0.56, y: y - lift - width * 1.18,
               width: width * 1.12, height: width * 1.24)
    }
}

struct KurtRoomMap: Codable {
    var version: Int
    var imageSHA256: String
    var provenance: String
    var floor: [[KurtPoint]]
    var seat: [KurtPoint]
    var obstacles: [[KurtPoint]]
    var seatFront: [KurtPoint]
    var rawRegions: [KurtRegion]
    var extraSeats: [[KurtPoint]]? = nil
    var extraFronts: [[KurtPoint]]? = nil
    var allSeats: [[KurtPoint]] { ([seat] + (extraSeats ?? [])).filter { !$0.isEmpty } }
    var allFronts: [[KurtPoint]] { ([seatFront] + (extraFronts ?? [])).filter { !$0.isEmpty } }

    /// The shipped route is deliberately fixed. A changed proposal must still
    /// support every cel and its complete swept footprint before it can run.
    func problem(frames: [KurtFrame], imageSHA256 currentImage: String) -> String? {
        guard version == 1, imageSHA256 == currentImage else { return "Die Raumkarte gehört nicht zu diesem Bild." }
        guard !floor.isEmpty, !frames.isEmpty else { return "Boden oder Bildfolge fehlen." }
        for polygon in floor + allSeats + obstacles + allFronts {
            guard KurtGeometry.valid(polygon) else { return "Ein Polygon ist ungültig oder schneidet sich selbst." }
        }
        var previous: KurtFrame?
        for frame in frames {
            guard [frame.x, frame.y, frame.lift, frame.width].allSatisfy(\.isFinite),
                  frame.width > 0, frame.width < 0.5, frame.lift >= 0 else { return "Ungültige Bildposition." }
            switch frame.support {
            case "floor":
                guard floor.contains(where: { KurtGeometry.covers($0, frame.footprint) }) else {
                    return "Bild \(frame.index + 1): Nicht alle Pfoten stehen auf freiem Boden."
                }
            case "seat":
                guard allSeats.contains(where: { KurtGeometry.covers($0, frame.footprint) }) else {
                    return "Bild \(frame.index + 1): Die Sitzfläche ist zu klein oder falsch platziert."
                }
            case "air": break
            default: return "Unbekannter Flächentyp."
            }
            let sweptBody = previous.map { $0.bodyBounds.union(frame.bodyBounds) } ?? frame.bodyBounds
            guard !obstacles.contains(where: { KurtGeometry.intersects($0, sweptBody) }) else {
                return "Bild \(frame.index + 1): Kurt oder sein Sprungweg berührt ein Hindernis."
            }
            if let previous, frame.support == "floor", previous.support == "floor" {
                let sweep = previous.footprint.union(frame.footprint)
                guard floor.contains(where: { KurtGeometry.covers($0, sweep) }) else {
                    return "Der Weg zwischen zwei Bildern verlässt den freien Boden."
                }
            }
            previous = frame
        }
        return nil
    }
}

enum KurtGeometry {
    private static let epsilon = 1e-10
    private static func cross(_ a: KurtPoint, _ b: KurtPoint, _ c: KurtPoint) -> Double {
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    }
    private static func onSegment(_ point: KurtPoint, _ a: KurtPoint, _ b: KurtPoint) -> Bool {
        abs(cross(a, b, point)) < epsilon && point.x >= min(a.x, b.x) - epsilon && point.x <= max(a.x, b.x) + epsilon
            && point.y >= min(a.y, b.y) - epsilon && point.y <= max(a.y, b.y) + epsilon
    }
    private static func crosses(_ a: KurtPoint, _ b: KurtPoint, _ c: KurtPoint, _ d: KurtPoint, touching: Bool) -> Bool {
        let abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
        if ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
            && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon)) { return true }
        return touching && (onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d))
    }
    private static func edges(_ polygon: [KurtPoint]) -> [(KurtPoint, KurtPoint)] {
        polygon.indices.map { (polygon[$0], polygon[($0 + 1) % polygon.count]) }
    }
    private static func corners(_ rect: CGRect) -> [KurtPoint] {
        [.init(x: rect.minX, y: rect.minY), .init(x: rect.maxX, y: rect.minY),
         .init(x: rect.maxX, y: rect.maxY), .init(x: rect.minX, y: rect.maxY)]
    }
    static func valid(_ polygon: [KurtPoint]) -> Bool {
        guard polygon.count >= 3, polygon.count <= 64,
              polygon.allSatisfy({ $0.x.isFinite && $0.y.isFinite && (0...1).contains($0.x) && (0...1).contains($0.y) }),
              Set(polygon).count == polygon.count else { return false }
        let segments = edges(polygon)
        let area = abs(segments.reduce(0) { $0 + $1.0.x * $1.1.y - $1.1.x * $1.0.y }) / 2
        guard area > 0.00001 else { return false }
        for i in segments.indices {
            for j in segments.indices where j > i + 1 && !(i == 0 && j == segments.count - 1) {
                if crosses(segments[i].0, segments[i].1, segments[j].0, segments[j].1, touching: true) { return false }
            }
        }
        return true
    }
    static func contains(_ polygon: [KurtPoint], _ point: KurtPoint) -> Bool {
        guard polygon.count >= 3 else { return false }
        var inside = false
        for (a, b) in edges(polygon) {
            if onSegment(point, a, b) { return true }
            if (a.y > point.y) != (b.y > point.y), point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x {
                inside.toggle()
            }
        }
        return inside
    }
    static func covers(_ polygon: [KurtPoint], _ rect: CGRect) -> Bool {
        let box = corners(rect)
        guard box.allSatisfy({ contains(polygon, $0) }) else { return false }
        // A notch can enter exactly at rectangle corners without a strict
        // edge crossing. Its inward vertex still cuts the footprint.
        if polygon.contains(where: { $0.x > rect.minX + epsilon && $0.x < rect.maxX - epsilon
            && $0.y > rect.minY + epsilon && $0.y < rect.maxY - epsilon }) { return false }
        // Corners alone miss a concave notch cutting through the middle.
        for (a, b) in edges(polygon) {
            for (c, d) in edges(box) where crosses(a, b, c, d, touching: false) { return false }
        }
        return true
    }
    static func intersects(_ polygon: [KurtPoint], _ rect: CGRect) -> Bool {
        let box = corners(rect)
        if box.contains(where: { contains(polygon, $0) }) || polygon.contains(where: { contains(box, $0) }) { return true }
        return edges(polygon).contains { a, b in edges(box).contains { c, d in crosses(a, b, c, d, touching: true) } }
    }
}

/// Image, masks, vertices and Kurt all share this exact aspect-fit transform.
struct KurtProjection {
    var frame: CGRect
    init(frame: CGRect) { self.frame = frame }
    init(image: CGSize, canvas: CGSize, fill: Bool = false, anchor: CGPoint = CGPoint(x: 0.5, y: 0.5)) {
        let scale = fill ? max(canvas.width / max(image.width, 1), canvas.height / max(image.height, 1)) : min(canvas.width / max(image.width, 1), canvas.height / max(image.height, 1))
        let size = CGSize(width: image.width * scale, height: image.height * scale)
        frame = CGRect(x: (canvas.width - size.width) * anchor.x, y: (canvas.height - size.height) * anchor.y, width: size.width, height: size.height)
    }
    func position(_ point: KurtPoint) -> CGPoint { CGPoint(x: frame.minX + point.x * frame.width, y: frame.minY + point.y * frame.height) }
    func normalized(_ point: CGPoint) -> KurtPoint {
        .init(x: min(1, max(0, (point.x - frame.minX) / max(frame.width, 1))), y: min(1, max(0, (point.y - frame.minY) / max(frame.height, 1))))
    }
    func path(_ points: [KurtPoint]) -> CGPath {
        let path = CGMutablePath()
        for (i, point) in points.enumerated() {
            if i == 0 { path.move(to: position(point)) } else { path.addLine(to: position(point)) }
        }
        path.closeSubpath()
        return path
    }
}
