// SPDX-License-Identifier: AGPL-3.0-only
import Foundation

/// Every route is materialized in image coordinates and checked before its
/// first cel. The same frames drive drawing, hit areas and event placement.
enum KurtMotion {
    private static let perspectiveSlope = 0.073
    /// One size rule for every support surface. Jump lift changes height,
    /// never perspective; available surface area only decides whether Kurt fits.
    static func width(atDepth depth: Double) -> Double { 0.035 + perspectiveSlope * depth }

    /// Foot depth depends on sprite size while the nape stays at the finger:
    /// width = base + slope * (gripDepth + footOffsetPerWidth * width).
    static func carriedWidth(gripDepth: Double, footOffsetPerWidth: Double) -> Double {
        let width = width(atDepth: gripDepth) / (1 - perspectiveSlope * footOffsetPerWidth)
        return min(Self.width(atDepth: 1), max(Self.width(atDepth: 0), width))
    }

    /// A complete trot, with acceleration/settling once, repeated planted
    /// strides in between, and perspective tied exclusively to floor depth.
    static func roaming(atlas: KurtAtlasManifest, map: KurtRoomMap, from origin: KurtFrame, to target: KurtFrame) -> [KurtFrame]? {
        guard origin.support == "floor", target.support == "floor", let sequence = atlas.sequence("run-floor"),
              origin.width > 0, target.width > 0, hypot(target.x - origin.x, target.y - origin.y) > 0.035 else { return nil }
        let logRatio = log(target.width / origin.width)
        let meanWidth = abs(logRatio) < 0.000001 ? origin.width : (target.width - origin.width) / logRatio
        let distance = hypot(target.x - origin.x, target.y - origin.y)
        let cycles = max(1, min(9, Int((distance * 427 / meanWidth / 252).rounded())))
        let curve = [0.0, 66, 100, 118, 126, 164, 199, 248]
        var frames: [KurtFrame] = []
        func append(_ offset: Int, _ progress: Double) {
            var frame = atlas.frames[sequence.first + offset].placed(at: origin)
            let t = abs(logRatio) < 0.000001 ? progress : expm1(logRatio * progress) / expm1(logRatio)
            frame.x = origin.x + (target.x - origin.x) * t
            frame.y = origin.y + (target.y - origin.y) * t
            frame.width = width(atDepth: frame.y)
            frame.lift *= frame.width / (104.0 / 1280)
            frame.facing = abs(target.x - origin.x) < 0.005 ? origin.facing : target.x < origin.x ? 1 : -1
            frames.append(frame)
        }
        for offset in 0..<4 { append(offset, 0) }
        for cycle in 0..<cycles { for phase in 0..<8 { append(4 + phase, (Double(cycle * 252) + curve[phase]) / Double(cycles * 252)) } }
        for offset in (sequence.count - 4)..<sequence.count { append(offset, 1) }
        return map.problem(frames: frames, imageSHA256: map.imageSHA256) == nil ? frames : nil
    }
    static func wanderTargets(from origin: KurtFrame) -> [KurtFrame] {
        var targets: [KurtFrame] = []
        // Full compass, including near-vertical and short routes out of a
        // narrow starting area. Distance includes depth, not just screen X.
        for heading in 0..<16 { for cycles in [1.5, 3.0, 5.0, 7.0] {
            let angle = Double(heading) * .pi / 8
            let depthScale = perspectiveSlope * sin(angle), root = cycles * 252 / 427
            let distance = abs(depthScale) < 0.000001 ? origin.width * root : origin.width * expm1(depthScale * root) / depthScale
            var target = origin
            target.x += cos(angle) * distance; target.y += sin(angle) * distance
            target.width = width(atDepth: target.y); target.lift = 0
            targets.append(target)
        } }
        return targets
    }
    static func supported(_ frame: KurtFrame, map: KurtRoomMap) -> Bool {
        map.problem(frames: [frame], imageSHA256: map.imageSHA256) == nil
    }
    /// User-carried paths may cross furniture; only the final supporting
    /// surface is a walking position. A cushion under the finger is an
    /// explicit seat target; floor drops snap at most 24 screen points.
    static func dropTarget(at point: KurtPoint, contact: KurtPoint? = nil, from origin: KurtFrame, atlas: KurtAtlasManifest,
                           map: KurtRoomMap, projection: KurtProjection,
                           available: (KurtFrame) -> Bool = { _ in true }) -> KurtFrame? {
        let touched = contact.map { finger in map.allSeats.filter { KurtGeometry.contains($0, finger) } } ?? []
        let seats = touched.isEmpty ? map.allSeats.filter { KurtGeometry.contains($0, point) } : touched
        if !seats.isEmpty {
            var candidates: [KurtFrame] = []
            let preferred = touched.isEmpty ? point : contact ?? point
            for polygon in seats {
                let xs = polygon.map(\.x), ys = polygon.map(\.y)
                guard let left = xs.min(), let right = xs.max(), let top = ys.min(), let bottom = ys.max() else { continue }
                var locations = [preferred, point]
                // The finger need not precisely align all four paws. Find a
                // nearby place on this cushion without scaling Kurt to fit.
                for row in 0...8 { for column in 0...8 {
                    locations.append(.init(x: left + (right - left) * Double(column) / 8,
                                           y: top + (bottom - top) * Double(row) / 8))
                } }
                for p in locations {
                    var frame = origin
                    frame.x = p.x; frame.y = p.y; frame.width = width(atDepth: p.y)
                    frame.lift = 0; frame.support = "seat"
                    if KurtGeometry.covers(polygon, frame.footprint), supported(frame, map: map), available(frame) { candidates.append(frame) }
                }
            }
            let pointer = projection.position(preferred)
            return candidates.sorted {
                let a = projection.position(.init(x: $0.x, y: $0.y)), b = projection.position(.init(x: $1.x, y: $1.y))
                return hypot(a.x - pointer.x, a.y - pointer.y) < hypot(b.x - pointer.x, b.y - pointer.y)
            }.first { landing(from: $0, on: "floor", atlas: atlas, map: map, available: available) != nil }
        }
        var points = [point]
        for radius in [8.0, 16, 24] {
            for step in 0..<8 {
                let angle = Double(step) * .pi / 4
                points.append(.init(x: point.x + cos(angle) * radius / projection.frame.width,
                                    y: point.y + sin(angle) * radius / projection.frame.height))
            }
        }
        for p in points {
            for support in ["seat", "floor"] {
                var frame = origin
                frame.x = p.x; frame.y = p.y; frame.lift = 0
                frame.width = width(atDepth: p.y); frame.support = support
                guard supported(frame, map: map), available(frame) else { continue }
                if support == "seat", landing(from: frame, on: "floor", atlas: atlas, map: map, available: available) == nil { continue }
                return frame
            }
        }
        return nil
    }
    static func floorAnchors(map: KurtRoomMap, template: KurtFrame) -> [KurtFrame] {
        var points = [KurtPoint(x: 0.305, y: 0.635), KurtPoint(x: 0.385, y: 0.635)]
        for y in stride(from: 0.45, through: 0.92, by: 0.025) {
            for x in stride(from: 0.10, through: 0.90, by: 0.025) { points.append(.init(x: x, y: y)) }
        }
        return points.compactMap { point in
            var f = template
            f.x = point.x; f.y = point.y; f.width = width(atDepth: point.y)
            f.lift = 0; f.support = "floor"
            return supported(f, map: map) ? f : nil
        }
    }
    static func seatAnchors(map: KurtRoomMap, template: KurtFrame) -> [KurtFrame] {
        map.allSeats.compactMap { polygon in
            let xs = polygon.map(\.x), ys = polygon.map(\.y)
            guard let left = xs.min(), let right = xs.max(), let top = ys.min(), let bottom = ys.max() else { return nil }
            for fraction in [0.55, 0.40, 0.65] {
                var f = template
                f.x = (left + right) / 2; f.y = top + (bottom - top) * fraction
                f.width = width(atDepth: f.y)
                f.lift = 0; f.support = "seat"
                if supported(f, map: map) { return f }
            }
            return nil
        }
    }
    static func frames(_ sequence: KurtSequence, atlas: KurtAtlasManifest, from origin: KurtFrame, to target: KurtFrame? = nil) -> [KurtFrame] {
        atlas.frames[sequence.first...sequence.last].enumerated().map { offset, source in
            var frame = source.placed(at: origin)
            if sequence.id.hasPrefix("jump-"), let target {
                let t = min(1, max(0, Double(offset - 5) / 13))
                frame.x = origin.x + (target.x - origin.x) * t
                frame.y = origin.y + (target.y - origin.y) * t
                frame.width = width(atDepth: frame.y)
                frame.lift = source.lift * max(origin.width, target.width) / (104.0 / 1280)
                frame.support = offset < 5 ? origin.support : offset < 18 ? "air" : target.support
            } else if let distance = sequence.distance {
                let t = source.travel ?? Double(offset) / Double(max(1, sequence.count - 1))
                let direction = (origin.facing ?? -1) < 0 ? 1.0 : -1.0
                frame.x = origin.x + distance * origin.width / (104.0 / 1280) * direction * t
            }
            if sequence.id.hasPrefix("turn-"), offset >= sequence.count / 2 { frame.facing = -(origin.facing ?? -1) }
            return frame
        }
    }
    static func route(_ id: String, atlas: KurtAtlasManifest, map: KurtRoomMap, from origin: KurtFrame, to target: KurtFrame? = nil) -> [KurtFrame]? {
        guard let sequence = atlas.sequence(id) else { return nil }
        let frames = frames(sequence, atlas: atlas, from: origin, to: target)
        guard map.problem(frames: frames, imageSHA256: map.imageSHA256) == nil else { return nil }
        return frames
    }
    static func landing(from origin: KurtFrame, on support: String, atlas: KurtAtlasManifest, map: KurtRoomMap, available: (KurtFrame) -> Bool = { _ in true }, targetAllowed: (KurtFrame) -> Bool = { _ in true }) -> KurtFrame? {
        let candidates = support == "floor" ? floorAnchors(map: map, template: origin) : seatAnchors(map: map, template: origin)
        let id = support == "floor" ? "jump-down" : origin.support == "seat" ? "jump-seat" : "jump-up"
        return candidates.sorted { hypot($0.x - origin.x, $0.y - origin.y) < hypot($1.x - origin.x, $1.y - origin.y) }.first {
            let distance = hypot($0.x - origin.x, $0.y - origin.y)
            guard available($0), distance > 0.018, distance < 0.30, abs($0.x - origin.x) < 0.24, targetAllowed($0) else { return false }
            // A seat is only usable if Kurt has a validated way back down.
            guard let path = route(id, atlas: atlas, map: map, from: origin, to: $0), path.allSatisfy(available) else { return false }
            if support == "seat", origin.support == "floor" { return route("jump-down", atlas: atlas, map: map, from: $0, to: origin) != nil }
            return true
        }
    }
}
