import SwiftUI
@preconcurrency import AVFoundation
@preconcurrency import Speech

/// Preserve the existing draft across partial revisions and pauses between utterances.
struct DictationTranscript: Sendable {
    private var prefix: String
    private var utterance = ""
    private var completed = false
    private var endTime: TimeInterval?

    init(initialText: String) { prefix = initialText }

    mutating func receive(
        _ text: String, completed: Bool, startTime: TimeInterval?, endTime: TimeInterval?
    ) -> String {
        guard !text.isEmpty else { return value }
        let followsPrevious = if let startTime, let previousEnd = self.endTime {
            startTime > 0 && startTime >= previousEnd && previousEnd > 0
        } else { false }
        let beginsNewUtterance = followsPrevious
            || (self.completed && !completed && !text.hasPrefix(utterance))
        if beginsNewUtterance && !utterance.isEmpty {
            prefix = joined(prefix, utterance)
        }
        utterance = text
        self.completed = completed
        self.endTime = endTime
        return value
    }

    var value: String { joined(prefix, utterance) }

    private func joined(_ first: String, _ second: String) -> String {
        guard !first.isEmpty else { return second }
        guard !second.isEmpty else { return first }
        return first + (first.last?.isWhitespace == true ? "" : " ") + second
    }
}

@MainActor
@Observable
final class IntentDictationController {
    private(set) var isListening = false
    private(set) var isStarting = false
    private(set) var message: String?
    var isActive: Bool { isListening || isStarting }

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var generation = UUID()
    private var transcript = DictationTranscript(initialText: "")

    func toggle(currentText: String, update: @escaping @MainActor (String) -> Void) {
        if isActive { stop(); return }
        isStarting = true
        message = nil
        let run = UUID()
        generation = run
        Task { await start(currentText: currentText, run: run, update: update) }
    }

    func stop() {
        // Permission replies and recognition callbacks from an old session cannot edit the draft.
        generation = UUID()
        if let audioEngine {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        isListening = false
        isStarting = false
    }

    private func start(currentText: String, run: UUID, update: @escaping @MainActor (String) -> Void) async {
        let speechAllowed = await Self.speechPermission()
        guard generation == run else { return }
        guard speechAllowed else {
            message = "Allow Menlo in System Settings → Privacy & Security → Speech Recognition."
            stop()
            return
        }
        let microphoneAllowed = await AVCaptureDevice.requestAccess(for: .audio)
        guard generation == run else { return }
        guard microphoneAllowed else {
            message = "Allow Menlo in System Settings → Privacy & Security → Microphone."
            stop()
            return
        }
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            message = "Speech recognition is unavailable right now. You can keep typing."
            stop()
            return
        }
        transcript = DictationTranscript(initialText: currentText)
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        recognitionRequest = request
        do {
            let engine = AVAudioEngine()
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                message = "No microphone is available. Connect one and try again."
                stop()
                return
            }
            input.installTap(onBus: 0, bufferSize: 1_024, format: format, block: Self.audioTap(request))
            audioEngine = engine
            engine.prepare()
            try engine.start()
            isStarting = false
            isListening = true
            recognitionTask = Self.recognize(recognizer, request: request) { [weak self] spoken, completed, startTime, endTime, final, failed in
                Task { @MainActor in
                    guard let self, self.generation == run else { return }
                    if let spoken {
                        update(self.transcript.receive(
                            spoken, completed: completed, startTime: startTime, endTime: endTime
                        ))
                    }
                    if failed { self.message = "Dictation stopped. Your text is still here; click Speak to continue." }
                    if final || failed { self.stop() }
                }
            }
        } catch {
            message = "The microphone couldn’t start. Your text is still here; try again."
            stop()
        }
    }

    // Apple invokes these callbacks on audio/recognition queues, outside MainActor.
    nonisolated private static func audioTap(_ request: SFSpeechAudioBufferRecognitionRequest) -> AVAudioNodeTapBlock {
        { buffer, _ in request.append(buffer) }
    }

    nonisolated private static func recognize(
        _ recognizer: SFSpeechRecognizer, request: SFSpeechAudioBufferRecognitionRequest,
        update: @escaping @Sendable (String?, Bool, TimeInterval?, TimeInterval?, Bool, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            let transcription = result?.bestTranscription
            let last = transcription?.segments.last
            update(
                transcription?.formattedString, result?.speechRecognitionMetadata != nil,
                transcription?.segments.first?.timestamp,
                last.map { $0.timestamp + $0.duration }, result?.isFinal ?? false, error != nil
            )
        }
    }

    nonisolated private static func speechPermission() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: true
        case .notDetermined:
            await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
        case .denied, .restricted: false
        @unknown default: false
        }
    }
}

struct ComposerTools: View {
    @Bindable var model: TohsenoAppModel
    @Binding var text: String
    @Binding var harness: String?
    @Binding var selectedModel: String?
    @Bindable var dictation: IntentDictationController
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 16) {
                IntelligencePicker(model: model, harness: $harness, selectedModel: $selectedModel)
                Spacer(minLength: 0)
                Button {
                    dictation.toggle(currentText: text) { text = $0 }
                } label: {
                    Label(
                        dictation.isStarting ? "Cancel" : dictation.isListening ? "Stop" : "Speak",
                        systemImage: dictation.isActive ? "stop.fill" : "mic.fill"
                    )
                    .font(.callout.weight(.semibold))
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(dictation.isActive ? TohsenoTheme.amber : TohsenoTheme.graphite)
                    .foregroundStyle(dictation.isActive ? TohsenoTheme.void : TohsenoTheme.bone)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(model.isSubmitting)
                .help(dictation.isActive ? "Stop dictation and keep your words" : "Speak to add to your draft")
                .accessibilityLabel(dictation.isActive ? "Stop dictation" : "Dictate your idea")
                .accessibilityIdentifier("composer.microphone")
            }
            if dictation.isActive {
                Label(dictation.isStarting ? "Waiting for permission…" : "Listening… click Stop when you’re done.", systemImage: "waveform")
                    .font(.caption)
                    .foregroundStyle(TohsenoTheme.amber)
                    .accessibilityAddTraits(.updatesFrequently)
            } else if let message = dictation.message {
                Text(message).font(.caption).foregroundStyle(TohsenoTheme.silver)
            }
        }
        .onDisappear { dictation.stop() }
        .onChange(of: model.isSubmitting) { _, submitting in
            if submitting { dictation.stop() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active && dictation.isListening { dictation.stop() }
        }
    }
}

struct IntelligencePicker: View {
    let model: TohsenoAppModel
    @Binding var harness: String?
    @Binding var selectedModel: String?

    private var options: [FactoryHarnessOption] {
        (model.defaults?.harnesses ?? []).filter { $0.id != "tohseno-managed" }
    }

    private var provider: FactoryHarnessOption? {
        options.first { $0.id == (harness ?? model.defaults?.harnessID) }
    }

    private var providerSelection: Binding<String?> {
        Binding(get: { harness }, set: { value in
            if harness != value { selectedModel = nil }
            harness = value
        })
    }

    private var modelSelection: Binding<String?> {
        Binding(get: { selectedModel }, set: { value in
            // Selecting a model pins its provider too, even when starting from Automatic.
            if value != nil, harness == nil { harness = provider?.id }
            selectedModel = value
        })
    }

    var body: some View {
        HStack(spacing: 14) {
            Picker("Intelligence", selection: providerSelection) {
                Text("Auto · \(model.defaults?.harnessLabel ?? "detecting…")").tag(String?.none)
                ForEach(options) { option in
                    Text(providerLabel(option)).tag(Optional(option.id))
                }
                if let harness, !options.contains(where: { $0.id == harness }) {
                    Text("\(harness) · unavailable").tag(Optional(harness))
                }
            }
            .accessibilityIdentifier("intelligence.provider")
            Picker("Model", selection: modelSelection) {
                Text(defaultModelLabel).tag(String?.none)
                ForEach(provider?.models ?? []) { choice in
                    Text(choice.label).tag(Optional(choice.id))
                }
                if let selectedModel, !(provider?.models.contains(where: { $0.id == selectedModel }) ?? false) {
                    Text(selectedModel).tag(Optional(selectedModel))
                }
            }
            .disabled(provider == nil)
            .accessibilityIdentifier("intelligence.model")
        }
        .pickerStyle(.menu)
        .font(.callout)
        .fixedSize(horizontal: false, vertical: true)
        .disabled(model.isSubmitting)
    }

    private var defaultModelLabel: String {
        if harness == nil, let label = model.defaults?.modelLabel { return "Auto · \(label)" }
        if let label = provider?.models.first(where: \.isDefault)?.label { return "Auto · \(label)" }
        return "Default model"
    }

    private func providerLabel(_ option: FactoryHarnessOption) -> String {
        if !option.installed { return "\(option.label) · not installed" }
        if option.authentication == .notDetected { return "\(option.label) · sign in needed" }
        if !option.routes.contains(where: \.available) { return "\(option.label) · unavailable" }
        return option.label
    }
}
