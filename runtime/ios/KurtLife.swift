// SPDX-License-Identifier: AGPL-3.0-only
import Foundation

enum KurtWasteKind: String, Codable { case poop, vomit }
struct KurtWaste: Codable, Identifiable {
    // Apply to stored artwork widths as well as new deposits, so existing
    // marks shrink without changing their room position or persistence.
    static let artworkScale = 0.5
    var id = UUID()
    var kind: KurtWasteKind
    var due: Double
    var room: String?
    var image: String?
    var point: KurtPoint?
    var width: Double?
    var reserved = false
    var visible: Bool { point != nil }
    var displayedWidth: Double { (width ?? 0.02) * Self.artworkScale }
}

/// The clock is active foreground time, never a calendar deadline. Persisting
/// an event turns a reservation into the same visible event, not a new one.
struct KurtLife: Codable {
    var seconds = 0.0
    var swallowed = 0
    var recent: [Double] = []
    var lastMeal: Double?
    var meal: UUID?
    var waste: [KurtWaste] = []
    var swallowedIDs: [UUID] = []
    var feedingID: UUID?
    var feedingMeal: UUID?
    var feedingVomit: UUID?

    /// Placed marks belong to the room, independently of Kurt's whereabouts.
    /// They have no expiry; only explicit cleanup removes them.
    func placedWaste(in room: String, image: String) -> [KurtWaste] {
        waste.filter { $0.visible && $0.room == room && $0.image == image }
    }

    var recentCount: Int { recent.filter { seconds - $0 <= 30 }.count }
    var canShareMeal: Bool {
        guard let meal, let lastMeal, seconds - lastMeal <= 30 else { return false }
        return waste.contains { $0.id == meal && !$0.visible }
    }
    var canFeed: Bool {
        // A pug accepts treats. The session still queues at most one next
        // interaction; every accepted meal retains its actual consequences.
        feedingID == nil
    }
    var nextDue: KurtWaste? {
        waste.filter { !$0.visible && !$0.reserved && $0.due <= seconds }.sorted {
            if $0.kind != $1.kind { return $0.kind == .vomit }
            return $0.due < $1.due
        }.first
    }
    mutating func advance(_ elapsed: Double) {
        guard elapsed.isFinite, elapsed > 0 else { return }
        seconds += elapsed
        recent.removeAll { seconds - $0 > 30 }
    }
    @discardableResult mutating func reserveFood(_ id: UUID) -> Bool {
        guard !swallowedIDs.contains(id), canFeed else { return false }
        feedingID = id
        if canShareMeal { feedingMeal = meal }
        else {
            var event = KurtWaste(kind: .poop, due: seconds + 180)
            event.reserved = true
            waste.append(event)
            feedingMeal = event.id
        }
        if recentCount >= 3 {
            var event = KurtWaste(kind: .vomit, due: seconds)
            event.reserved = true
            waste.append(event)
            feedingVomit = event.id
        }
        return true
    }
    mutating func cancelFood() {
        waste.removeAll { $0.reserved }
        feedingID = nil; feedingMeal = nil; feedingVomit = nil
    }
    @discardableResult mutating func swallow(_ id: UUID) -> Bool {
        guard !swallowedIDs.contains(id) else { return false }
        if feedingID == nil, !reserveFood(id) { return false }
        guard feedingID == id, let mealID = feedingMeal,
              let index = waste.firstIndex(where: { $0.id == mealID }) else { return false }
        swallowedIDs.append(id)
        if swallowedIDs.count > 64 { swallowedIDs.removeFirst(swallowedIDs.count - 64) }
        swallowed += 1
        if waste[index].reserved { waste[index].due = seconds + 180 }
        waste[index].reserved = false
        meal = mealID
        lastMeal = seconds
        recent.append(seconds)
        if recentCount >= 4, let vomitID = feedingVomit, let vomit = waste.firstIndex(where: { $0.id == vomitID }) {
            waste[vomit].due = seconds
            waste[vomit].reserved = false
            recent.removeAll()
        }
        waste.removeAll { $0.reserved }
        feedingID = nil; feedingMeal = nil; feedingVomit = nil
        return true
    }
    /// Only a completed animation's deposit marker may call this on valid floor.
    @discardableResult mutating func deposit(_ id: UUID, room: String, image: String, point: KurtPoint, width: Double) -> Bool {
        guard let index = waste.firstIndex(where: { $0.id == id && !$0.visible }), waste[index].due <= seconds else { return false }
        waste[index].room = room
        waste[index].image = image
        waste[index].point = point
        waste[index].width = width
        return true
    }
    mutating func remove(_ id: UUID) { waste.removeAll { $0.id == id && $0.visible } }
}

struct KurtRoomInterest: Codable {
    var value = 0.0
    var updated = Date()
    func score(at date: Date) -> Double { value * pow(0.5, max(0, date.timeIntervalSince(updated)) / (7 * 86_400)) }
}

struct KurtSavedState: Codable {
    var life = KurtLife()
    var rooms: [String: KurtRoomInterest] = [:]
    var maps: [String: KurtRoomMap] = [:]
    var approvedImages: Set<String> = []
    var enabled = false
    var resident: String?
}

@MainActor final class KurtPersistence {
    private let defaults: UserDefaults
    private let key: String
    init(defaults: UserDefaults = .standard, scope: String) {
        self.defaults = defaults
        key = "hauser.private.kurt.v1." + scope
    }
    func load() -> KurtSavedState {
        guard let data = defaults.data(forKey: key), let state = try? JSONDecoder().decode(KurtSavedState.self, from: data) else { return KurtSavedState() }
        return state
    }
    func save(_ state: KurtSavedState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }
}
