// SPDX-License-Identifier: AGPL-3.0-only
import Foundation

extension KurtMotion {
    /// Only the lower edge is a portal. The clipped, still-visible footprint
    /// must remain on known floor; no invented floor through furniture.
    static func bottomExit(atlas: KurtAtlasManifest, map: KurtRoomMap, from origin: KurtFrame,
                           visible: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1),
                           available: (KurtFrame) -> Bool = { _ in true }) -> [KurtFrame]? {
        guard origin.support == "floor", supported(origin, map: map), let sequence = atlas.sequence("run-floor") else { return nil }
        let edge = min(1, visible.maxY)
        let image = CGRect(x: 0, y: 0, width: 1, height: edge)
        func frame(_ p: KurtPoint) -> KurtFrame {
            var f = origin; f.x = p.x; f.y = p.y; f.width = width(atDepth: min(1, p.y)); f.lift = 0
            return f
        }
        func clear(_ a: KurtFrame, _ b: KurtFrame) -> Bool {
            let floor = a.footprint.union(b.footprint).intersection(image)
            if !floor.isNull, floor.height > 0, !map.floor.contains(where: { KurtGeometry.covers($0, floor) }) { return false }
            let body = a.bodyBounds.union(b.bodyBounds).intersection(image)
            return (body.isNull || !map.obstacles.contains(where: { KurtGeometry.intersects($0, body) }))
                && b.bodyBounds.minX >= visible.minX && b.bodyBounds.maxX <= visible.maxX && available(b)
        }
        func segment(_ a: KurtPoint, _ b: KurtPoint) -> [KurtFrame]? {
            let distance = hypot(b.x - a.x, b.y - a.y)
            let count = max(1, Int(ceil(distance / 0.007)))
            var result = [frame(a)]
            for i in 1...count {
                let t = Double(i) / Double(count)
                let next = frame(.init(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t))
                guard clear(result.last!, next) else { return nil }
                result.append(next)
            }
            return result
        }
        // A small connected grid bends around furniture. Straight segments
        // are checked with the full swept body, including the final exit.
        let step = 0.035
        let columns = max(1, Int(ceil(visible.width / step)))
        let rows = max(1, Int(ceil((edge - max(0, visible.minY)) / step)))
        var nodes: [Int: KurtPoint] = [:]
        for row in 0...rows { for column in 0...columns {
            let p = KurtPoint(x: visible.minX + Double(column) * visible.width / Double(columns),
                              y: max(0, visible.minY) + Double(row) * (edge - max(0, visible.minY)) / Double(rows))
            let f = frame(p)
            if supported(f, map: map), available(f), f.bodyBounds.minX >= visible.minX, f.bodyBounds.maxX <= visible.maxX { nodes[row * (columns + 1) + column] = p }
        } }
        let start = KurtPoint(x: origin.x, y: origin.y)
        var queue: [Int] = [], previous: [Int: Int] = [:]
        for (id, p) in nodes.sorted(by: { hypot($0.value.x - start.x, $0.value.y - start.y) < hypot($1.value.x - start.x, $1.value.y - start.y) }).prefix(12) {
            if segment(start, p) != nil { queue.append(id); previous[id] = -1 }
        }
        var cursor = 0
        while cursor < queue.count {
            let id = queue[cursor]; cursor += 1
            guard let p = nodes[id] else { continue }
            if p.y >= edge - 0.09 {
                let end = KurtPoint(x: p.x, y: edge + width(atDepth: 1) * 1.6)
                if let tail = segment(p, end) {
                    var ids = [id], parent = previous[id] ?? -1
                    while parent != -1 { ids.append(parent); parent = previous[parent] ?? -1 }
                    let points = [start] + ids.reversed().compactMap { nodes[$0] }
                    // Remove grid corners when the direct route is clear.
                    var path: [KurtFrame] = [], index = 0
                    while index < points.count - 1 {
                        var next = points.count - 1
                        while next > index + 1 && segment(points[index], points[next]) == nil { next -= 1 }
                        guard let leg = segment(points[index], points[next]) else { return nil }
                        path.append(contentsOf: path.isEmpty ? leg : Array(leg.dropFirst()))
                        index = next
                    }
                    if path.isEmpty { path = [origin] }
                    path.append(contentsOf: tail.dropFirst())
                    return path.enumerated().map { index, position in
                        var cel = atlas.frames[sequence.first + 4 + index % 8].placed(at: position)
                        cel.lift = 0
                        return cel
                    }
                }
            }
            let row = id / (columns + 1), column = id % (columns + 1)
            for dy in -1...1 { for dx in -1...1 where dx != 0 || dy != 0 {
                let r = row + dy, c = column + dx
                guard r >= 0, r <= rows, c >= 0, c <= columns else { continue }
                let next = r * (columns + 1) + c
                guard previous[next] == nil, let point = nodes[next], segment(p, point) != nil else { continue }
                previous[next] = id; queue.append(next)
            } }
        }
        return nil
    }

    static func bottomEntry(atlas: KurtAtlasManifest, map: KurtRoomMap, to target: KurtFrame,
                            visible: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1),
                            available: (KurtFrame) -> Bool = { _ in true }) -> [KurtFrame]? {
        guard let path = bottomExit(atlas: atlas, map: map, from: target, visible: visible, available: available),
              let sequence = atlas.sequence("run-floor") else { return nil }
        return path.reversed().enumerated().map { index, position in
            var cel = atlas.frames[sequence.first + 4 + index % 8].placed(at: position)
            cel.lift = 0
            return cel
        }
    }
}
