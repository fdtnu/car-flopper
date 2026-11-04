import Foundation

// MARK: - Shared protocol models (must stay in sync with server/worker.js)

struct RoomPlayer: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var color: Int
    var x: Float
    var z: Float
    var ry: Float
    var moving: Bool
    var repairing: String?
}

struct PartState: Codable, Equatable {
    var progress: Float // 0...1
    var fixers: Int
}

struct RoomSnapshot: Codable, Equatable {
    var code: String
    var phase: String // "lobby" | "play" | "complete" | "finished"
    var carIndex: Int
    var hostId: String
    var players: [RoomPlayer]
    var parts: [String: PartState]
}

enum NetError: Error, LocalizedError {
    case badURL, roomNotFound, roomFull, server(String)
    var errorDescription: String? {
        switch self {
        case .badURL: return "Bad server URL"
        case .roomNotFound: return "Room not found - check the code"
        case .roomFull: return "Room is full (4 players)"
        case .server(let m): return m
        }
    }
}

final class RoomClient {
    // Central place for the server address; swapped when the Worker is deployed.
    static let httpBase = "https://car-flopper.federicotaranu.site"
    static var wsBase: String { httpBase.replacingOccurrences(of: "https://", with: "wss://") }

    static func createRoom() async throws -> String {
        guard let url = URL(string: "\(httpBase)/rooms") else { throw NetError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200,
              let obj = try? JSONDecoder().decode([String: String].self, from: data),
              let code = obj["code"] else { throw NetError.server("Could not create room") }
        return code
    }

    static func roomExists(_ code: String) async throws -> Bool {
        guard let url = URL(string: "\(httpBase)/rooms/\(code.uppercased())") else { throw NetError.badURL }
        let (_, resp) = try await URLSession.shared.data(from: url)
        guard let http = resp as? HTTPURLResponse else { throw NetError.server("No response") }
        if http.statusCode == 404 { return false }
        if http.statusCode == 409 { throw NetError.roomFull }
        return http.statusCode == 200
    }
}

// MARK: - Live websocket session

protocol GameSessionDelegate: AnyObject {
    func session(_ s: GameSession, didReceive snapshot: RoomSnapshot)
    func session(_ s: GameSession, didGetEvent kind: String, payload: [String: String])
    func sessionDidClose(_ s: GameSession, reason: String)
    // A dropped connection was transparently re-established: the server
    // assigned a fresh player id and the old player entry is gone.
    func sessionDidResume(_ s: GameSession)
}

final class GameSession: NSObject, URLSessionWebSocketDelegate {
    let code: String
    let name: String
    weak var delegate: GameSessionDelegate?
    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var closed = false

    // Reconnect-on-drop: a transient reset (like the ECONNRESET reproduced in
    // 204-era gameplay) must not end the session on its own. The replacement
    // socket is opened BEFORE the old one is retired, so even a solo room
    // never goes empty during the rejoin (an empty room is destroyed
    // server-side). Only after retries run out does the delegate hear
    // sessionDidClose, which is what bounces the player to the menu.
    private var reconnectAttempt = 0
    private var reconnectWork: DispatchWorkItem?
    private var retiring: (task: URLSessionWebSocketTask, session: URLSession)?
    var maxReconnectAttempts = 4
    var reconnectDelay: (Int) -> TimeInterval = { min(0.8 * pow(2.0, Double($0)), 6.0) }

    var snapshot: RoomSnapshot?
    private(set) var myId: String?

    init(code: String, name: String) {
        self.code = code.uppercased()
        self.name = name
    }

    func connect() throws {
        try openTask()
    }

    private func openTask() throws {
        guard var c = URLComponents(string: "\(RoomClient.wsBase)/rooms/\(code)/ws") else { throw NetError.badURL }
        c.queryItems = [URLQueryItem(name: "name", value: name)]
        guard let url = c.url else { throw NetError.badURL }
        // nil delegate queue: receive handlers and JSON decode run on a background
        // queue, never on main; delegate callbacks hop to MainActor themselves
        let s = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        self.session = s
        let t = s.webSocketTask(with: url)
        self.task = t
        t.resume()
        receive(on: t)
    }

    private func receive(on task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self, !self.closed, self.task === task else { return }
            switch result {
            case .success(let msg):
                switch msg {
                case .string(let text): self.handle(text)
                case .data(let d): if let text = String(data: d, encoding: .utf8) { self.handle(text) }
                @unknown default: break
                }
                self.receive(on: task)
            case .failure(let err):
                self.handleReceiveFailure(err)
            }
        }
    }

    // Single failure path for real socket errors and the FLOWTEST seam.
    func handleReceiveFailure(_ err: Error) {
        guard !closed else { return }
        if reconnectAttempt < maxReconnectAttempts {
            let delay = reconnectDelay(reconnectAttempt)
            reconnectAttempt += 1
            NSLog("[CFNET] receive failed (%@); reconnecting to room %@ in %.1fs (attempt %d/%d)",
                  err.localizedDescription, code, delay, reconnectAttempt, maxReconnectAttempts)
            let work = DispatchWorkItem { [weak self] in self?.reopen() }
            reconnectWork = work
            DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + delay, execute: work)
        } else {
            NSLog("[CFNET] receive failed (%@); giving up after %d reconnect attempts", err.localizedDescription, reconnectAttempt)
            delegate?.sessionDidClose(self, reason: err.localizedDescription)
        }
    }

    private func reopen() {
        guard !closed else { return }
        cancelRetiring()
        let oldTask = task, oldSession = session
        do {
            try openTask()
            // Retire the old connection only once the replacement proves
            // itself with a welcome; until then it keeps a solo room alive.
            if let oldTask, let oldSession { retiring = (oldTask, oldSession) }
        } catch {
            oldTask?.cancel(with: .normalClosure, reason: nil)
            oldSession?.invalidateAndCancel()
            handleReceiveFailure(error)
        }
    }

    private func cancelRetiring() {
        retiring?.task.cancel(with: .normalClosure, reason: nil)
        retiring?.session.invalidateAndCancel()
        retiring = nil
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let t = obj["t"] as? String else { return }
        if t == "welcome", let id = obj["id"] as? String {
            let isResume = self.myId != nil && self.myId != id
            self.myId = id
            self.reconnectAttempt = 0
            if isResume {
                NSLog("[CFNET] reconnected to room %@ with a fresh player id", self.code)
                self.cancelRetiring()
                self.delegate?.sessionDidResume(self)
            }
        } else if t == "state", let payload = obj["room"],
           let pd = try? JSONSerialization.data(withJSONObject: payload),
           let snap = try? JSONDecoder().decode(RoomSnapshot.self, from: pd) {
            self.snapshot = snap
            delegate?.session(self, didReceive: snap)
        } else if t == "event", let kind = obj["kind"] as? String {
            var payload: [String: String] = [:]
            for (k, v) in obj where k != "t" && k != "kind" {
                if let s = v as? String { payload[k] = s }
            }
            delegate?.session(self, didGetEvent: kind, payload: payload)
        } else if t == "error", let m = obj["message"] as? String {
            delegate?.sessionDidClose(self, reason: m)
        }
    }

    private func send(_ dict: [String: Any]) {
        guard !closed, let data = try? JSONSerialization.data(withJSONObject: dict),
              let text = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(text)) { _ in }
    }

    func sendPosition(x: Float, z: Float, ry: Float, moving: Bool) {
        send(["t": "pos", "x": x, "z": z, "ry": ry, "moving": moving])
    }

    func sendRepair(part: String?, on: Bool) {
        send(["t": "repair", "part": part ?? NSNull(), "on": on])
    }

    func sendStart() { send(["t": "start"]) }
    func sendNextCar() { send(["t": "next"]) }
    func sendPickCar(_ index: Int) { send(["t": "pick", "car": index]) }

    func close() {
        closed = true
        reconnectWork?.cancel()
        reconnectWork = nil
        cancelRetiring()
        task?.cancel(with: .normalClosure, reason: nil)
        session?.invalidateAndCancel()
    }
}
