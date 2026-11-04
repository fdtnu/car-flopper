import SwiftUI

@main
struct CarFlopperApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .persistentSystemOverlays(.hidden)
        }
    }
}

struct RootView: View {
    @StateObject private var flow = FlowModel()

    var body: some View {
        switch flow.screen {
        case .menu:
            MenuView { session in flow.enterLobby(session: session) }
        case .lobby:
            if let vm = flow.vm {
                LobbyView(vm: vm, onStart: { vm.startGame() }, onLeave: { flow.leave() })
            }
        case .game:
            if let vm = flow.vm {
                GameView(vm: vm, onLeave: { flow.leave() })
            }
        }
    }
}

@MainActor
final class FlowModel: ObservableObject {
    enum Screen { case menu, lobby, game }
    @Published var screen: Screen = .menu
    var vm: GameViewModel?
    private var phaseWatch: Task<Void, Never>?

    init() {
        //FLOWTEST if ProcessInfo.processInfo.arguments.contains("-CFLifecycleTest") {
        //FLOWTEST     Task { await runLifecycleChecks() }
        //FLOWTEST }
    }

    // Compiled into the simulator validation build only.
    //FLOWTEST private func runLifecycleChecks() async {
    //FLOWTEST     func pause() async { try? await Task.sleep(nanoseconds: 450_000_000) }
    //FLOWTEST     func check(_ condition: Bool, _ label: String) {
    //FLOWTEST         NSLog("[CFFLOWTEST] %@ %@", condition ? "PASS" : "FAIL", label)
    //FLOWTEST     }
    //FLOWTEST     let oldSession = GameSession(code: "TEST", name: "OLD")
    //FLOWTEST     enterLobby(session: oldSession)
    //FLOWTEST     guard let old = vm else { check(false, "old room exists"); return }
    //FLOWTEST     await pause()
    //FLOWTEST     var oldTicks = 0
    //FLOWTEST     var oldDelayFired = false
    //FLOWTEST     let oldTimer = old.scheduleSimulatorTimer(withTimeInterval: 0.05, repeats: true) { _ in oldTicks += 1 }
    //FLOWTEST     old.scheduleSimulatorDelay(deadline: .now() + 0.20) { oldDelayFired = true }
    //FLOWTEST     leave()
    //FLOWTEST     let ticksAtLeave = oldTicks
    //FLOWTEST     enterLobby(session: GameSession(code: "TEST", name: "NEW"))
    //FLOWTEST     guard let current = vm else { check(false, "new room exists"); return }
    //FLOWTEST     old.phase = "play"
    //FLOWTEST     old.connectionError = "late old-room reset"
    //FLOWTEST     await pause()
    //FLOWTEST     check(vm === current && screen == .lobby, "stale phase and error cannot close replacement")
    //FLOWTEST     check(!oldTimer.isValid && oldTicks == ticksAtLeave && !oldDelayFired, "old timers and delayed actions stop on leave")
    //FLOWTEST     old.session(oldSession, didReceive: RoomSnapshot(code: "TEST", phase: "play", carIndex: 0, hostId: "old", players: [], parts: [:]))
    //FLOWTEST     old.sessionDidClose(oldSession, reason: "queued late callback")
    //FLOWTEST     await pause()
    //FLOWTEST     check(old.connectionError == "late old-room reset" && vm === current, "queued old session callbacks ignored")
    //FLOWTEST     current.phase = "play"
    //FLOWTEST     await pause()
    //FLOWTEST     check(vm === current && screen == .game, "current phase reaches game")
    //FLOWTEST     current.connectionError = "current-room reset"
    //FLOWTEST     await pause()
    //FLOWTEST     check(vm == nil && screen == .menu, "current error returns to menu")
    //FLOWTEST     enterLobby(session: GameSession(code: "TEST", name: "REENTRY"))
    //FLOWTEST     guard let reentry = vm else { check(false, "reentry exists"); return }
    //FLOWTEST     reentry.phase = "play"
    //FLOWTEST     await pause()
    //FLOWTEST     check(vm === reentry && screen == .game, "leave and reentry phase works")
    //FLOWTEST     leave()
    //FLOWTEST     reentry.phase = "lobby"
    //FLOWTEST     await pause()
    //FLOWTEST     check(vm == nil && screen == .menu, "left room cannot reopen lobby")
    //FLOWTEST     // Live reconnect: a real room on the production server, a
    //FLOWTEST     // simulated local failure, then a real rejoin. This verifies
    //FLOWTEST     // the replacement-socket ordering (room never goes empty),
    //FLOWTEST     // duplicate-player reaping and host ownership against the
    //FLOWTEST     // live server instead of assuming them.
    //FLOWTEST     if let liveCode = try? await RoomClient.createRoom() {
    //FLOWTEST         check(true, "live room created for reconnect test")
    //FLOWTEST         let liveSession = GameSession(code: liveCode, name: "RECON")
    //FLOWTEST         liveSession.maxReconnectAttempts = 2
    //FLOWTEST         liveSession.reconnectDelay = { _ in 0.2 }
    //FLOWTEST         enterLobby(session: liveSession)
    //FLOWTEST         guard let liveVM = vm else { check(false, "reconnect room view model exists"); NSLog("[CFFLOWTEST] DONE"); return }
    //FLOWTEST         try? liveSession.connect()
    //FLOWTEST         for _ in 0..<40 { if liveSession.myId != nil { break }; try? await Task.sleep(nanoseconds: 200_000_000) }
    //FLOWTEST         let firstId = liveSession.myId
    //FLOWTEST         check(firstId != nil, "reconnect test joined live room")
    //FLOWTEST         liveSession.handleReceiveFailure(NetError.server("simulated reset"))
    //FLOWTEST         for _ in 0..<40 { if liveSession.myId != firstId { break }; try? await Task.sleep(nanoseconds: 200_000_000) }
    //FLOWTEST         check(liveSession.myId != nil && liveSession.myId != firstId, "live reconnect rejoins room with a fresh id")
    //FLOWTEST         check(vm === liveVM && liveVM.connectionError == nil, "reconnect avoids error bounce to menu")
    //FLOWTEST         for _ in 0..<40 { if liveVM.players.count == 1 { break }; try? await Task.sleep(nanoseconds: 200_000_000) }
    //FLOWTEST         check(liveVM.players.count == 1 && liveVM.players.first?.id == liveSession.myId, "ghost player reaped after reconnect")
    //FLOWTEST         for _ in 0..<40 { if liveVM.hostId == liveSession.myId { break }; try? await Task.sleep(nanoseconds: 200_000_000) }
    //FLOWTEST         check(liveVM.isHost, "room ownership returns to rejoined player")
    //FLOWTEST         leave()
    //FLOWTEST     } else {
    //FLOWTEST         check(false, "live room created for reconnect test")
    //FLOWTEST     }
    //FLOWTEST     // Dead room: retries exhaust and the error still bounces to menu.
    //FLOWTEST     let deadSession = GameSession(code: "ZZZ9", name: "DEAD")
    //FLOWTEST     deadSession.maxReconnectAttempts = 2
    //FLOWTEST     deadSession.reconnectDelay = { _ in 0.05 }
    //FLOWTEST     enterLobby(session: deadSession)
    //FLOWTEST     try? deadSession.connect()
    //FLOWTEST     for _ in 0..<50 { if vm == nil { break }; try? await Task.sleep(nanoseconds: 200_000_000) }
    //FLOWTEST     check(vm == nil && screen == .menu, "dead room reconnect gives up to menu")
    //FLOWTEST     NSLog("[CFFLOWTEST] DONE")
    //FLOWTEST }

    func enterLobby(session: GameSession) {
        // A new room replaces the old room, including its phase watcher.
        phaseWatch?.cancel()
        vm?.leave()
        let vm = GameViewModel(session: session)
        self.vm = vm
        self.screen = .lobby
        phaseWatch = Task { [weak self, weak vm] in
            var lastPhase = "lobby"
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 300_000_000) }
                catch { return }
                // Recheck after suspension. A stale room must never move or
                // close a newer room, even if its last callback arrives late.
                guard !Task.isCancelled, let self, let vm,
                      self.vm === vm else { return }
                if vm.phase != lastPhase {
                    lastPhase = vm.phase
                    if vm.phase == "play" || vm.phase == "complete" { self.screen = .game }
                    if vm.phase == "lobby" { self.screen = .lobby }
                }
                if vm.connectionError != nil { self.leave(); return }
            }
        }
    }

    func leave() {
        phaseWatch?.cancel()
        phaseWatch = nil
        vm?.leave()
        vm = nil
        screen = .menu
    }
}
