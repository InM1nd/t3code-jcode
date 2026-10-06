import Darwin
import Foundation
import Network

private enum ListenerError: Error, LocalizedError {
  case invalidArguments
  case invalidPort(String)

  var errorDescription: String? {
    switch self {
    case .invalidArguments:
      return "Usage: local-domain-listener --listen-port <1-65535> --target-port <1-65535>"
    case let .invalidPort(value):
      return "Invalid port: \(value)"
    }
  }
}

private func parsePort(_ value: String) throws -> NWEndpoint.Port {
  guard let rawValue = UInt16(value), rawValue > 0, let port = NWEndpoint.Port(rawValue: rawValue) else {
    throw ListenerError.invalidPort(value)
  }
  return port
}

private func parseArguments() throws -> (listenPort: NWEndpoint.Port, targetPort: NWEndpoint.Port) {
  let arguments = Array(CommandLine.arguments.dropFirst())
  guard arguments.count == 4,
        arguments[0] == "--listen-port",
        arguments[2] == "--target-port"
  else {
    throw ListenerError.invalidArguments
  }
  return (try parsePort(arguments[1]), try parsePort(arguments[3]))
}

private final class ConnectionForwarder {
  private enum Direction {
    case clientToUpstream
    case upstreamToClient
  }

  private let client: NWConnection
  private let upstream: NWConnection
  private var closed = false
  private var clientReadComplete = false
  private var upstreamReadComplete = false
  var onClose: (() -> Void)?

  init(client: NWConnection, targetPort: NWEndpoint.Port) {
    self.client = client
    upstream = NWConnection(
      host: .ipv4(IPv4Address("127.0.0.1")!),
      port: targetPort,
      using: .tcp
    )
  }

  func start(on queue: DispatchQueue) {
    let closeOnFailure: (NWConnection.State) -> Void = { [weak self] state in
      if case .failed = state {
        self?.close()
      }
    }
    client.stateUpdateHandler = closeOnFailure
    upstream.stateUpdateHandler = closeOnFailure
    client.start(queue: queue)
    upstream.start(queue: queue)
    forward(client, to: upstream, direction: .clientToUpstream)
    forward(upstream, to: client, direction: .upstreamToClient)
  }

  private func forward(_ source: NWConnection, to target: NWConnection, direction: Direction) {
    source.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
      guard let self else { return }
      if error != nil {
        close()
        return
      }
      if let data, !data.isEmpty {
        target.send(
          content: data,
          contentContext: isComplete ? .finalMessage : .defaultMessage,
          isComplete: isComplete,
          completion: .contentProcessed { [weak self] sendError in
          guard let self else { return }
          if sendError != nil {
            close()
          } else if isComplete {
            finish(direction)
          } else {
            forward(source, to: target, direction: direction)
          }
        })
      } else if isComplete {
        target.send(
          content: nil,
          contentContext: .finalMessage,
          isComplete: true,
          completion: .contentProcessed { [weak self] sendError in
            guard let self else { return }
            if sendError != nil {
              close()
            } else {
              finish(direction)
            }
          }
        )
      } else {
        forward(source, to: target, direction: direction)
      }
    }
  }

  private func finish(_ direction: Direction) {
    switch direction {
    case .clientToUpstream:
      clientReadComplete = true
    case .upstreamToClient:
      upstreamReadComplete = true
    }
    if clientReadComplete && upstreamReadComplete {
      close()
    }
  }

  private func close() {
    guard !closed else { return }
    closed = true
    client.cancel()
    upstream.cancel()
    onClose?()
  }
}

private final class LocalDomainListener {
  private let listener: NWListener
  private let targetPort: NWEndpoint.Port
  private let queue = DispatchQueue(label: "com.t3tools.local-domain-listener")
  private var forwarders: [UUID: ConnectionForwarder] = [:]
  private var terminationSignal: DispatchSourceSignal?
  private var didEmitReady = false

  init(listenPort: NWEndpoint.Port, targetPort: NWEndpoint.Port) throws {
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(
      host: .ipv4(IPv4Address("127.0.0.1")!),
      port: listenPort
    )
    listener = try NWListener(using: parameters)
    self.targetPort = targetPort
  }

  func start() {
    listener.newConnectionHandler = { [weak self] connection in
      self?.accept(connection)
    }
    listener.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        guard let self, !self.didEmitReady else { return }
        self.didEmitReady = true
        FileHandle.standardOutput.write(Data("ready\n".utf8))
      case let .failed(error):
        FileHandle.standardError.write(Data("\(error)\n".utf8))
        self?.stop(exitCode: 1)
      default:
        break
      }
    }
    signal(SIGTERM, SIG_IGN)
    let terminationSignal = DispatchSource.makeSignalSource(signal: SIGTERM, queue: queue)
    terminationSignal.setEventHandler { [weak self] in
      self?.stop(exitCode: 0)
    }
    terminationSignal.resume()
    self.terminationSignal = terminationSignal
    listener.start(queue: queue)
  }

  private func accept(_ connection: NWConnection) {
    let id = UUID()
    let forwarder = ConnectionForwarder(client: connection, targetPort: targetPort)
    forwarder.onClose = { [weak self] in
      self?.forwarders[id] = nil
    }
    forwarders[id] = forwarder
    forwarder.start(on: queue)
  }

  private func stop(exitCode: Int32) {
    listener.cancel()
    terminationSignal?.cancel()
    terminationSignal = nil
    exit(exitCode)
  }
}

do {
  let arguments = try parseArguments()
  let listener = try LocalDomainListener(
    listenPort: arguments.listenPort,
    targetPort: arguments.targetPort
  )
  listener.start()
  dispatchMain()
} catch {
  FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
  exit(1)
}
