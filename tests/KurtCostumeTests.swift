// SPDX-License-Identifier: AGPL-3.0-only
// Run alongside the affected Hauser KurtLabTests against the shared runtime.
import XCTest
import UIKit
@testable import hauser

@MainActor final class KurtCostumeTests: XCTestCase {
    func testTextureSwapKeepsFrameClockAndSingleSwallow() throws {
        let root = try XCTUnwrap(Bundle.main.url(forResource: "KurtLab", withExtension: "bundle"))
        let atlas = try JSONDecoder().decode(KurtAtlasManifest.self, from: Data(contentsOf: root.appendingPathComponent("manifest.json")))
        let view = KurtSpriteView(frame: CGRect(x: 0, y: 0, width: 800, height: 600))
        XCTAssertTrue(view.load(atlas, root: root))
        let sequence = try XCTUnwrap(atlas.sequence("eat-floor"))
        var swallows = 0
        view.onSwallow = { swallows += 1 }
        view.play(sequence)
        view.advance(by: 2.4)
        let frame = view.frameIndex, contact = view.contactRect
        XCTAssertEqual(swallows, 0)
        XCTAssertTrue(view.setCostume("oma"))
        XCTAssertEqual(view.frameIndex, frame)
        XCTAssertEqual(view.contactRect, contact)
        XCTAssertTrue(view.isRunning)
        view.advance(by: 0.2)
        XCTAssertEqual(swallows, 1)
        XCTAssertTrue(view.setCostume(nil))
        view.advance(by: 0.1)
        XCTAssertEqual(swallows, 1)
        view.pause()
        let held = view.frameIndex
        XCTAssertTrue(view.setCostume("oma"))
        XCTAssertFalse(view.isRunning)
        XCTAssertEqual(view.frameIndex, held)
        XCTAssertFalse(view.setCostume("unknown"))
        XCTAssertEqual(view.costume, "oma")
        view.unload()
        XCTAssertNil(view.costume)
    }

    func testIncompleteCostumeKeepsTheCurrentAppearance() throws {
        let root = try XCTUnwrap(Bundle.main.url(forResource: "KurtLab", withExtension: "bundle"))
        var atlas = try JSONDecoder().decode(KurtAtlasManifest.self, from: Data(contentsOf: root.appendingPathComponent("manifest.json")))
        atlas.costumes?["broken"] = KurtCostume(label: "Broken", pages: Array(repeating: "missing.png", count: atlas.pages.count))
        let view = KurtSpriteView()
        XCTAssertTrue(view.load(atlas, root: root))
        XCTAssertTrue(view.setCostume("oma"))
        XCTAssertFalse(view.setCostume("broken"))
        XCTAssertEqual(view.costume, "oma")
        view.unload()
    }
}
