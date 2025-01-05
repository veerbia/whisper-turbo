// pages/index.tsx

import { useState, useEffect, useRef, ChangeEvent } from "react";
import Head from "next/head";
import Modal from "react-responsive-modal";
import { Toaster, toast } from "react-hot-toast";
import "react-responsive-modal/styles.css";
import {
  AvailableModels,
  InferenceSession,
  SessionManager,
  Segment,
  DecodingOptionsBuilder,
  initialize,
  Task,
  MicRecorder,
} from "whisper-turbo";
import { VT323 } from "@next/font/google";

declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<any>;
    };
  }
}

const vt = VT323({ weight: "400", display: "swap" });

// Utility Function
const humanFileSize = (sizeBytes: number | bigint): string => {
  const UNITS = [
    "byte",
    "kilobyte",
    "megabyte",
    "gigabyte",
    "terabyte",
    "petabyte",
  ];
  const BYTES_PER_KB = 1000;
  let size = Math.abs(Number(sizeBytes));
  let u = 0;
  while (size >= BYTES_PER_KB && u < UNITS.length - 1) {
    size /= BYTES_PER_KB;
    ++u;
  }
  return new Intl.NumberFormat([], {
    style: "unit",
    unit: UNITS[u],
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(size);
};

// Layout Component
const Layout = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => {
  return (
    <div
      className="flex h-full min-h-screen bg-sky-500 -z-20 antialiased"
      style={{
        backgroundColor: "#38bdf8",
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg width='30' height='30' opacity='0.4' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10h10v10H0V10zM10 0h10v10H10V0z' fill='%23bae6fd' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E\")",
      }}
    >
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta
          name="description"
          content="Transcribe any audio file - completely free!"
        />
        <meta
          property="og:description"
          content="Transcribe any audio file - completely free!"
        />
      </Head>
      <main className="flex flex-1 flex-col">
        <Toaster />
        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
};

// WebGPUModal Component
const WebGPUModal = () => {
  const [hasWebGPU, setHasWebGPU] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(true);

  useEffect(() => {
    if (!navigator.gpu) {
      setIsModalOpen(true);
    } else {
      setHasWebGPU(true);
      setIsModalOpen(false);
    }
  }, []);

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const closeIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
    >
      <path d="M6 6L18 18M6 18L18 6" stroke="white" strokeWidth="2" />
    </svg>
  );

  return (
    <>
      {!hasWebGPU && (
        <Modal
          open={isModalOpen}
          onClose={handleModalClose}
          center
          closeIcon={closeIcon}
        >
          <div className="text-center">
            <h2 className="text-2xl mb-4">WebGPU Not Supported</h2>
            <p>
              Your browser does not support WebGPU. Please try a different
              browser.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
};

// ConfigModal Component
interface ConfigOptions {
  language: string | null;
  task: Task;
  suppress_non_speech: boolean;
}

const ConfigModalComponent = ({
  isModalOpen,
  setIsModalOpen,
  configOptions,
  setConfigOptions,
}: {
  isModalOpen: boolean;
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  configOptions: ConfigOptions;
  setConfigOptions: React.Dispatch<React.SetStateAction<ConfigOptions>>;
}) => {
  const closeIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
    >
      <path d="M6 6L18 18M6 18L18 6" stroke="white" strokeWidth="2" />
    </svg>
  );

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    const value =
      target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target.value;
    const name = target.name;
    setConfigOptions((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <Modal
      open={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      center
      closeIcon={closeIcon}
    >
      <div className="flex flex-col space-y-4">
        <h2 className="text-2xl">Configuration</h2>
        <div>
          <label className="block text-lg">Language</label>
          <select
            name="language"
            value={configOptions.language || ""}
            onChange={handleChange}
            className="w-full p-2 border rounded"
          >
            <option value="">Auto</option>
            <option value="en">English</option>
            {/* Add more languages as needed */}
          </select>
        </div>
        <div>
          <label className="block text-lg">Task</label>
          <select
            name="task"
            value={configOptions.task}
            onChange={handleChange}
            className="w-full p-2 border rounded"
          >
            <option value={Task.Transcribe}>Transcribe</option>
            <option value={Task.Translate}>Translate</option>
          </select>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            name="suppress_non_speech"
            checked={configOptions.suppress_non_speech}
            onChange={handleChange}
            className="mr-2"
          />
          <label className="text-lg">Suppress Non-Speech Tokens</label>
        </div>
        <button
          onClick={() => setIsModalOpen(false)}
          className="mt-4 bg-blue-500 text-white py-2 rounded"
        >
          Save
        </button>
      </div>
    </Modal>
  );
};

// MicButton Component
interface AudioMetadata {
  file: File;
  fromMic: boolean;
}

const MicButton = ({
  setBlobUrl,
  setAudioData,
  setAudioMetadata,
}: {
  setBlobUrl: (url: string) => void;
  setAudioData: (data: Uint8Array) => void;
  setAudioMetadata: (metadata: AudioMetadata) => void;
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [mic, setMic] = useState<MicRecorder | null>(null);
  const SAMPLE_RATE = 16000;

  const handleRecord = async () => {
    const recorder = await MicRecorder.start();
    setMic(recorder);
  };

  const handleStop = async () => {
    if (!mic) return;
    const recording = await mic.stop();
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const resampled = await ctx.decodeAudioData(recording.buffer);
    const ch0 = resampled.getChannelData(0);
    setAudioData(new Uint8Array(ch0.buffer));
    const blob = recording.blob;
    setAudioMetadata({
      file: new File([blob], "recording.wav"),
      fromMic: true,
    });
    setBlobUrl(URL.createObjectURL(blob));
    setMic(null);
  };

  const handleClick = async () => {
    if (isRecording) {
      await handleStop();
    } else {
      await handleRecord();
    }
    setIsRecording(!isRecording);
  };

  return (
    <div className="flex flex-col">
      <label className="text-white text-xl font-semibold">Record</label>
      <button
        onClick={handleClick}
        className={`mt-2 p-2 rounded ${
          isRecording ? "bg-red-500" : "bg-green-500"
        } text-white`}
      >
        {isRecording ? "Stop Recording" : "Start Recording"}
      </button>
    </div>
  );
};

// ModelSelector Component
const ModelSelector = ({
  selectedModel,
  setSelectedModel,
  loaded,
  progress,
}: {
  selectedModel: AvailableModels | null;
  setSelectedModel: (model: AvailableModels) => void;
  loaded: boolean;
  progress: number;
}) => {
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  const displayModels = () => {
    const models = Object.values(AvailableModels).slice(0, -1);
    // Assuming ModelSizes is defined or replace with dummy sizes
    const sizes = [1000000, 2000000, 3000000, 4000000, 5000000]; // Example sizes
    const zipped = models.map((model, i) => [model, sizes[i]]);
    return zipped.map(([model, size], idx) => (
      <li
        key={model as string}
        className="bg-orange-500 hover:bg-pop-orange py-2 px-4 cursor-pointer"
        onClick={() => {
          setSelectedModel(model as AvailableModels);
          setDropdownOpen(false);
        }}
      >
        {model} ({humanFileSize(size as number)})
      </li>
    ));
  };

  return (
    <div className="mb-4">
      <label className="text-white text-xl font-semibold">Select Model</label>
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full bg-pop-orange text-white font-semibold py-2 px-4 rounded mt-2"
        >
          {selectedModel ? selectedModel : "Select Model"}
        </button>
        {dropdownOpen && (
          <ul className="absolute bg-pop-orange w-full mt-1 rounded shadow-lg">
            {displayModels()}
          </ul>
        )}
      </div>
      {progress > 0 && !loaded && (
        <div className="text-white mt-2">Loading: {progress.toFixed(2)}%</div>
      )}
    </div>
  );
};

// ControlPanel Component
interface Transcript {
  segments: Array<Segment>;
}

const ControlPanel = ({
  transcript,
  setTranscript,
  setDownloadAvailable,
}: {
  transcript: Transcript;
  setTranscript: React.Dispatch<React.SetStateAction<Transcript>>;
  setDownloadAvailable: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const session = useRef<InferenceSession | null>(null);
  const [selectedModel, setSelectedModel] = useState<AvailableModels | null>(
    null
  );
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  const [loadedModel, setLoadedModel] = useState<AvailableModels | null>(null);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(
    null
  );
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [configOptions, setConfigOptions] = useState<ConfigOptions>({
    language: null,
    task: Task.Transcribe,
    suppress_non_speech: true,
  });

  useEffect(() => {
    if (loadedModel && selectedModel != loadedModel && !transcribing) {
      setLoaded(false);
      setProgress(0);
    }
  }, [selectedModel]);

  const handleAudioFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAudioData(new Uint8Array(reader.result as ArrayBuffer));
      setAudioMetadata({
        file: file,
        fromMic: false,
      });
      setBlobUrl(URL.createObjectURL(file));
    };
    reader.readAsArrayBuffer(file);
  };

  const loadModel = async () => {
    if (session.current) {
      session.current.destroy();
    }
    if (modelLoading) return;
    if (!selectedModel) {
      toast.error("No model selected");
      return;
    }
    setModelLoading(true);

    const manager = new SessionManager();
    const loadResult = await manager.loadModel(
      selectedModel,
      () => {
        setLoaded(true);
        setLoadedModel(selectedModel);
      },
      (p: number) => setProgress(p)
    );
    if (loadResult.isErr) {
      toast.error(loadResult.error.message);
    } else {
      setModelLoading(false);
      session.current = loadResult.value;
    }
  };

  const runSession = async () => {
    if (!session.current) {
      toast.error("No model loaded");
      return;
    }
    if (!audioData) {
      toast.error("No audio file loaded");
      return;
    }
    setTranscript({ segments: [] });
    setTranscribing(true);
    await initialize();
    let builder = new DecodingOptionsBuilder();
    if (configOptions.language)
      builder = builder.setLanguage(configOptions.language);
    if (configOptions.suppress_non_speech)
      builder = builder.setSuppressTokens(Int32Array.from([-1]));
    else builder = builder.setSuppressTokens(Int32Array.from([]));

    builder = builder.setTask(configOptions.task);
    const options = builder.build();

    await session.current.transcribe(
      audioData,
      audioMetadata!.fromMic,
      options,
      (s: Segment) => {
        if (s.last) {
          setTranscribing(false);
          setDownloadAvailable(true);
          return;
        }
        setTranscript((prev) => ({
          ...prev,
          segments: [...prev.segments, s],
        }));
      }
    );
  };

  const handleDownload = () => {
    const jsonData = JSON.stringify(transcript);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.download = "transcript.json";
    link.href = url;

    link.click();
    link.remove();
  };

  return (
    <>
      <ConfigModalComponent
        isModalOpen={isConfigOpen}
        setIsModalOpen={setIsConfigOpen}
        configOptions={configOptions}
        setConfigOptions={setConfigOptions}
      />
      <div className="p-4">
        <ModelSelector
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          loaded={loaded}
          progress={progress}
        />
        {selectedModel !== loadedModel && (
          <button
            onClick={loadModel}
            className="bg-pop-orange text-white py-2 px-4 rounded"
            disabled={modelLoading}
          >
            {modelLoading ? "Loading..." : "Load Model"}
          </button>
        )}
        <div className="mt-4">
          <label className="text-white text-xl font-semibold">
            Upload Audio
          </label>
          <input
            type="file"
            accept=".wav,.aac,.m4a,.mp4,.mp3"
            onChange={handleAudioFile}
            className="block mt-2"
          />
        </div>
        <MicButton
          setBlobUrl={setBlobUrl}
          setAudioData={setAudioData}
          setAudioMetadata={setAudioMetadata}
        />
        {blobUrl && (
          <div className="mt-4">
            <audio controls src={blobUrl} className="w-full" />
          </div>
        )}
        <div className="flex space-x-4 mt-4">
          <button
            onClick={runSession}
            className="bg-blue-500 text-white py-2 px-4 rounded"
            disabled={transcribing}
          >
            {transcribing ? "Transcribing..." : "Transcribe"}
          </button>
          <button
            onClick={() => setIsConfigOpen(true)}
            className="bg-gray-500 text-white py-2 px-4 rounded"
          >
            Settings
          </button>
          <button
            onClick={handleDownload}
            className="bg-green-500 text-white py-2 px-4 rounded"
            disabled={!transcript.segments.length}
          >
            Download
          </button>
        </div>
      </div>
    </>
  );
};

// Main Home Component
const Home = () => {
  const [transcript, setTranscript] = useState<Transcript>({ segments: [] });
  const [downloadAvailable, setDownloadAvailable] = useState(false);

  return (
    <Layout title="Whisper Turbo">
      <div className={`p-0 ${vt.className}`}>
        <div className="flex gap-8 flex-col h-screen p-8">
          <ControlPanel
            transcript={transcript}
            setTranscript={setTranscript}
            setDownloadAvailable={setDownloadAvailable}
          />
          <div className="flex-1 overflow-auto p-4 bg-white rounded shadow">
            {transcript.segments.map((segment, idx) => (
              <div key={idx} className="mb-2">
                <p className="text-gray-700">{segment.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <WebGPUModal />
    </Layout>
  );
};

export default Home;
