(() => {
  "use strict";

  const apiEndpoint = "/api/realtime-token";

  const state = {
    running: false,
    pc: null,
    dc: null,
    stream: null,
    audioContext: null,
    analyser: null,
    animationFrame: null,
    logs: [],
    transcriptItems: [],
    japaneseStreamingElement: null
  };

  const elements = {
    inputDevice: document.querySelector("#inputDevice"),
    outputDevice: document.querySelector("#outputDevice"),
    voice: document.querySelector("#voice"),
    instructions: document.querySelector("#instructions"),
    refreshButton: document.querySelector("#refreshButton"),
    startButton: document.querySelector("#startButton"),
    copyTranscriptButton: document.querySelector("#copyTranscriptButton"),
    clearTranscriptButton: document.querySelector("#clearTranscriptButton"),
    copyDebugButton: document.querySelector("#copyDebugButton"),
    transcript: document.querySelector("#transcript"),
    emptyMessage: document.querySelector("#emptyMessage"),
    remoteAudio: document.querySelector("#remoteAudio"),
    statusDot: document.querySelector("#statusDot"),
    statusText: document.querySelector("#statusText"),
    inputLevelBar: document.querySelector("#inputLevelBar"),
    inputLevelText: document.querySelector("#inputLevelText")
  };

  function addLog(message, data = null) {
    const item = {
      time: new Date().toISOString(),
      message,
      data
    };

    state.logs.push(item);
    state.logs = state.logs.slice(-300);

    console.log("[Meeting Interpreter]", message, data ?? "");
  }

  function setStatus(text, active = false, error = false) {
    elements.statusText.textContent = text;
    elements.statusDot.className = "inline-block w-3 h-3 rounded-full";

    if (error) {
      elements.statusDot.classList.add("bg-red-500");
    } else if (active) {
      elements.statusDot.classList.add("bg-green-500", "animate-pulse");
    } else {
      elements.statusDot.classList.add("bg-gray-300");
    }
  }

  async function refreshDevices() {
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      permissionStream
        .getTracks()
        .forEach((track) => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs = devices.filter(
        (device) => device.kind === "audioinput"
      );

      const outputs = devices.filter(
        (device) => device.kind === "audiooutput"
      );

      const currentInput = elements.inputDevice.value;
      const currentOutput = elements.outputDevice.value;

      elements.inputDevice.innerHTML =
        '<option value="">既定の入力</option>';

      elements.outputDevice.innerHTML =
        '<option value="">システム既定</option>';

      inputs.forEach((device) => {
        const option = document.createElement("option");

        option.value = device.deviceId;
        option.textContent = device.label || "名称不明";

        elements.inputDevice.append(option);
      });

      outputs.forEach((device) => {
        const option = document.createElement("option");

        option.value = device.deviceId;
        option.textContent = device.label || "名称不明";

        elements.outputDevice.append(option);
      });

      const blackHole = inputs.find((device) =>
        device.label.toLowerCase().includes("blackhole")
      );

      if (
        currentInput &&
        inputs.some(
          (device) => device.deviceId === currentInput
        )
      ) {
        elements.inputDevice.value = currentInput;
      } else if (blackHole) {
        elements.inputDevice.value = blackHole.deviceId;
      }

      if (
        currentOutput &&
        outputs.some(
          (device) => device.deviceId === currentOutput
        )
      ) {
        elements.outputDevice.value = currentOutput;
      }

      addLog("音声デバイスを取得", {
        inputs: inputs.map((device) => device.label),
        outputs: outputs.map((device) => device.label)
      });
    } catch (error) {
      addLog("音声デバイス取得エラー", error.message);

      alert(
        "Chromeのマイク利用を許可してください。"
      );
    }
  }

  function startMeter(stream) {
    const audioContext = new AudioContext();

    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;

    const source =
      audioContext.createMediaStreamSource(stream);

    source.connect(analyser);

    state.audioContext = audioContext;
    state.analyser = analyser;

    const values = new Uint8Array(
      analyser.frequencyBinCount
    );

    const update = () => {
      analyser.getByteFrequencyData(values);

      const average =
        values.reduce(
          (sum, value) => sum + value,
          0
        ) / values.length;

      const level = Math.min(
        100,
        Math.round((average / 128) * 100)
      );

      elements.inputLevelBar.style.width =
        `${level}%`;

      elements.inputLevelText.textContent =
        `${level}%`;

      state.animationFrame =
        requestAnimationFrame(update);
    };

    update();
  }

  function stopMeter() {
    if (state.animationFrame) {
      cancelAnimationFrame(
        state.animationFrame
      );
    }

    state.audioContext?.close();

    state.audioContext = null;
    state.analyser = null;

    elements.inputLevelBar.style.width = "0%";
    elements.inputLevelText.textContent = "0%";
  }

  function removeEmptyMessage() {
    elements.emptyMessage?.remove();
  }

  function appendTranscript(
    role,
    text,
    streaming = false
  ) {
    removeEmptyMessage();

    const wrapper =
      document.createElement("div");

    wrapper.className =
      role === "英語"
        ? "mb-3 text-gray-500"
        : "mb-3 text-gray-900";

    const badge =
      document.createElement("span");

    badge.className =
      role === "英語"
        ? "mr-2 inline-block rounded-md bg-gray-200 px-2 py-1 text-xs font-bold"
        : "mr-2 inline-block rounded-md bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700";

    badge.textContent = role;

    const content =
      document.createElement("span");

    content.className = "leading-7";
    content.textContent = text;

    wrapper.append(
      badge,
      content
    );

    elements.transcript.append(wrapper);

    elements.transcript.scrollTop =
      elements.transcript.scrollHeight;

    const item = {
      role,
      text
    };

    state.transcriptItems.push(item);

    if (streaming) {
      state.japaneseStreamingElement = {
        wrapper,
        content,
        item
      };
    }
  }

  function appendJapaneseDelta(delta) {
    if (!state.japaneseStreamingElement) {
      appendTranscript(
        "日本語",
        delta,
        true
      );

      return;
    }

    state.japaneseStreamingElement
      .content
      .textContent += delta;

    state.japaneseStreamingElement
      .item
      .text += delta;

    elements.transcript.scrollTop =
      elements.transcript.scrollHeight;
  }

  function finishJapaneseStreaming() {
    state.japaneseStreamingElement = null;
  }

  function handleRealtimeEvent(event) {
    switch (event.type) {
      case "response.output_audio_transcript.delta":
        if (event.delta) {
          appendJapaneseDelta(event.delta);
        }
        break;

      case "response.output_audio_transcript.done":
        finishJapaneseStreaming();
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) {
          appendTranscript(
            "英語",
            event.transcript
          );
        }
        break;

      case "error":
        addLog(
          "Realtime APIエラー",
          event.error
        );
        break;

      default:
        break;
    }
  }

  async function startInterpreter() {
    if (state.running) {
      return;
    }

    try {
      setStatus("接続準備中");

      addLog("接続開始");

      const constraints = {
        audio: {
          deviceId:
            elements.inputDevice.value
              ? {
                  exact:
                    elements.inputDevice.value
                }
              : undefined,

          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1
        }
      };

      const stream =
        await navigator.mediaDevices.getUserMedia(
          constraints
        );

      state.stream = stream;

      startMeter(stream);

      const pc =
        new RTCPeerConnection();

      state.pc = pc;

      pc.ontrack = async (event) => {
        elements.remoteAudio.srcObject =
          event.streams[0];

        if (
          elements.outputDevice.value &&
          typeof elements.remoteAudio.setSinkId ===
            "function"
        ) {
          await elements.remoteAudio.setSinkId(
            elements.outputDevice.value
          );
        }

        await elements.remoteAudio.play();
      };

      stream
        .getTracks()
        .forEach((track) =>
          pc.addTrack(track, stream)
        );

      const dc =
        pc.createDataChannel("oai-events");

      state.dc = dc;

      dc.addEventListener(
        "open",
        () => {
          state.running = true;

          elements.startButton.textContent =
            "停止";

          elements.startButton.className =
            "w-full bg-red-600 text-white rounded-xl p-3 mt-3 font-bold";

          elements.inputDevice.disabled = true;
          elements.outputDevice.disabled = true;
          elements.voice.disabled = true;
          elements.instructions.disabled = true;

          setStatus(
            "通訳中",
            true
          );

          addLog(
            "Realtime APIに接続"
          );
        }
      );

      dc.addEventListener(
        "message",
        (message) => {
          const event =
            JSON.parse(message.data);

          handleRealtimeEvent(event);
        }
      );

      dc.addEventListener(
        "close",
        () => {
          addLog(
            "データチャンネル終了"
          );
        }
      );

      pc.addEventListener(
        "connectionstatechange",
        () => {
          addLog(
            "WebRTC接続状態",
            pc.connectionState
          );

          if (
            [
              "failed",
              "disconnected"
            ].includes(
              pc.connectionState
            )
          ) {
            setStatus(
              pc.connectionState,
              false,
              true
            );
          }
        }
      );

      const offer =
        await pc.createOffer();

      await pc.setLocalDescription(
        offer
      );

      const response = await fetch(
        apiEndpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/sdp",

            "X-Meeting-Voice":
              elements.voice.value,

            "X-Meeting-Instructions":
              encodeURIComponent(
                elements.instructions.value
              )
          },

          body: offer.sdp
        }
      );

      if (!response.ok) {
        throw new Error(
          await response.text()
        );
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await response.text()
      });
    } catch (error) {
      addLog(
        "接続エラー",
        error.message
      );

      setStatus(
        "エラー",
        false,
        true
      );

      stopInterpreter(false);

      alert(
        `接続できませんでした。\n\n${error.message}`
      );
    }
  }

  function stopInterpreter(
    updateStatus = true
  ) {
    state.dc?.close();
    state.pc?.close();

    state.stream
      ?.getTracks()
      .forEach((track) =>
        track.stop()
      );

    elements.remoteAudio.pause();
    elements.remoteAudio.srcObject = null;

    stopMeter();

    state.pc = null;
    state.dc = null;
    state.stream = null;
    state.running = false;

    elements.startButton.textContent =
      "通訳を開始";

    elements.startButton.className =
      "w-full bg-blue-600 text-white rounded-xl p-3 mt-3 font-bold";

    elements.inputDevice.disabled = false;
    elements.outputDevice.disabled = false;
    elements.voice.disabled = false;
    elements.instructions.disabled = false;

    if (updateStatus) {
      setStatus("停止");
    }

    addLog("通訳停止");
  }

  async function copyTranscript() {
    const text =
      state.transcriptItems
        .map(
          (item) =>
            `[${item.role}] ${item.text}`
        )
        .join("\n");

    await navigator.clipboard.writeText(text);

    alert(
      "通訳ログをコピーしました"
    );
  }

  function clearTranscript() {
    state.transcriptItems = [];
    state.japaneseStreamingElement = null;

    elements.transcript.innerHTML = `
      <div
        id="emptyMessage"
        class="text-center text-gray-500 mt-20"
      >
        通訳を開始するとここへ表示されます
      </div>
    `;

    elements.emptyMessage =
      document.querySelector(
        "#emptyMessage"
      );
  }

  async function copyDebugConsole() {
    const payload = {
      timestamp:
        new Date().toISOString(),

      userAgent:
        navigator.userAgent,

      secureContext:
        window.isSecureContext,

      location:
        window.location.href,

      status:
        elements.statusText.textContent,

      selectedInput:
        elements.inputDevice.options[
          elements.inputDevice.selectedIndex
        ]?.text,

      selectedOutput:
        elements.outputDevice.options[
          elements.outputDevice.selectedIndex
        ]?.text,

      logs:
        state.logs
    };

    await navigator.clipboard.writeText(
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    alert(
      "デバッグ情報をコピーしました"
    );
  }

  elements.refreshButton.addEventListener(
    "click",
    refreshDevices
  );

  elements.startButton.addEventListener(
    "click",
    () => {
      state.running
        ? stopInterpreter()
        : startInterpreter();
    }
  );

  elements.copyTranscriptButton.addEventListener(
    "click",
    copyTranscript
  );

  elements.clearTranscriptButton.addEventListener(
    "click",
    clearTranscript
  );

  elements.copyDebugButton.addEventListener(
    "click",
    copyDebugConsole
  );

  navigator.mediaDevices
    ?.addEventListener?.(
      "devicechange",
      refreshDevices
    );

  window.addEventListener(
    "beforeunload",
    () => stopInterpreter(false)
  );

  refreshDevices();
})();
