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
