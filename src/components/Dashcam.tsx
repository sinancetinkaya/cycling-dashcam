import React, { useEffect, useRef, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useHeartRateMonitor } from '../hooks/useHeartRateMonitor';
import { usePowerMeter } from '../hooks/usePowerMeter';
import { APP_VERSION } from '../constants';
import { Circle, Square, Camera, Download, Settings, Maximize, Minimize, RefreshCw, Terminal, Heart, Zap, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DebugModal } from './DebugModal';

function getSupportedMimeType(videoPref: string, audioPref: string) {
  const typesToTry: string[] = [];
  
  let vCodecs = [];
  if (videoPref === 'AV1') vCodecs = ['av01'];
  else if (videoPref === 'H265') vCodecs = ['hvc1', 'hev1'];
  else if (videoPref === 'H264') vCodecs = ['avc1', 'h264'];
  else if (videoPref === 'VP9') vCodecs = ['vp9'];
  else if (videoPref === 'VP8') vCodecs = ['vp8'];
  else vCodecs = ['av01', 'hvc1', 'hev1', 'avc1', 'h264', 'vp9', 'vp8']; // Auto

  let aCodecs = [];
  if (audioPref === 'Opus') aCodecs = ['opus'];
  else if (audioPref === 'AAC') aCodecs = ['mp4a.40.2'];
  else aCodecs = ['opus', 'mp4a.40.2']; // Auto

  for (const vc of vCodecs) {
    for (const ac of aCodecs) {
      const container = (vc === 'avc1' || vc === 'hvc1' || vc === 'hev1' || ac === 'mp4a.40.2') ? 'video/mp4' : 'video/webm';
      typesToTry.push(`${container};codecs=${vc},${ac}`);
    }
    const container = (vc === 'avc1' || vc === 'hvc1' || vc === 'hev1') ? 'video/mp4' : 'video/webm';
    typesToTry.push(`${container};codecs=${vc}`);
  }
  
  // Fallbacks
  typesToTry.push('video/mp4');
  typesToTry.push('video/webm');

  for (const type of typesToTry) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

const getLocalTimestamp = () => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

// Dashcam Component: The core of the application that handles camera feed, telemetry overlays, and recording.
export default function Dashcam() {
  // Refs for DOM elements and persistent objects
  const videoRef = useRef<HTMLVideoElement>(null); // Hidden video element to capture camera stream
  const canvasRef = useRef<HTMLCanvasElement>(null); // Visible canvas where we draw video + overlays
  
  // State management for UI and app status
  const [isRecording, setIsRecording] = useState(false);
  const [isLoopModeActive, setIsLoopModeActive] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>((window as any).deferredPrompt); // Initialize from global
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [sensorMenu, setSensorMenu] = useState<'hr' | 'pm' | 'gps' | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setShowSettings(false);
      setSensorMenu(null);
      setShowDebugModal(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const longPressTimerRef = useRef<any>(null);
  const isLongPressActive = useRef(false);

  const handleSensorPointerDown = (type: 'hr' | 'pm' | 'gps') => {
    isLongPressActive.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActive.current = true;
      window.history.pushState({ menu: 'sensor' }, '');
      setSensorMenu(type);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
  };

  const handleSensorPointerUp = (e: React.PointerEvent, action: () => void) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    if (isLongPressActive.current) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      action();
    }
  };

  const forgetSensor = (type: 'hr' | 'pm') => {
    if (type === 'hr') {
      localStorage.removeItem('dashcam_hr_device_id');
      disconnectHeartRate();
    } else {
      localStorage.removeItem('dashcam_pm_device_id');
      disconnectPowerMeter();
    }
    window.history.back();
  };

  // Loop Mode State
  const [isLooping, setIsLooping] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const loopRecorderRef = useRef<MediaRecorder | null>(null);
  const loopChunksRef = useRef<{ blob: Blob; timestamp: number }[]>([]);
  const loopHeaderChunkRef = useRef<Blob | null>(null);
  const LOOP_DURATION = 60000; // 60 seconds
  const CHUNK_INTERVAL = 5000; // 5 second slices

  // Timer for recording duration
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Screen Wake Lock
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Screen Wake Lock acquired');
      }
    } catch (err: any) {
      console.error(`Failed to acquire wake lock: ${err.name}, ${err.message}`);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current !== null) {
      wakeLockRef.current.release()
        .then(() => {
          console.log('Screen Wake Lock released');
          wakeLockRef.current = null;
        })
        .catch((err: any) => console.error(`Failed to release wake lock: ${err.message}`));
    }
  };

  // Re-acquire wake lock if visibility changes (e.g., user switches tabs and comes back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Manage wake lock based on recording state
  useEffect(() => {
    if (isRecording || isLooping) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    
    return () => {
      releaseWakeLock();
    };
  }, [isRecording, isLooping]);

  // PWA: Listen for the 'beforeinstallprompt' event to show a custom install button
  useEffect(() => {
    const handlePrompt = () => {
      setDeferredPrompt((window as any).deferredPrompt);
    };
    
    window.addEventListener('pwa-prompt-available', handlePrompt);
    
    // Also check immediately in case it's already there
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    return () => window.removeEventListener('pwa-prompt-available', handlePrompt);
  }, []);

  // PWA: Trigger the installation dialog
  const handleInstallClick = async () => {
    // Check if we are in an iframe (AI Studio preview)
    const isInIframe = window.self !== window.top;
    
    if (isInIframe) {
      setInstallStatus('iframe');
      setTimeout(() => setInstallStatus(null), 10000);
      return;
    }

    if (!deferredPrompt) {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setInstallStatus('already-installed');
      } else {
        setInstallStatus('manual');
      }
      setTimeout(() => setInstallStatus(null), 10000);
      return;
    }

    try {
      console.log('Triggering PWA prompt...', deferredPrompt);
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('PWA prompt outcome:', outcome);
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        (window as any).deferredPrompt = null;
        setInstallStatus('success');
      } else {
        setInstallStatus('dismissed');
      }
    } catch (err) {
      console.error('Install error:', err);
      setInstallStatus('error');
    }
    setTimeout(() => setInstallStatus(null), 5000);
  };

  // UI: Sync local state with browser's fullscreen status
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Configuration for which telemetry items to show on the overlay
  const [supportedVideoCodecs, setSupportedVideoCodecs] = useState<{name: string, value: string}[]>([
    { name: 'Auto (Best Available)', value: 'Auto' }
  ]);
  const [supportedAudioCodecs, setSupportedAudioCodecs] = useState<{name: string, value: string}[]>([
    { name: 'Auto (Best Available)', value: 'Auto' }
  ]);
  const [supportedFramerates, setSupportedFramerates] = useState<{name: string, value: string}[]>([
    { name: 'Auto (Best Available)', value: 'Auto' }
  ]);

  useEffect(() => {
    const vCodecsToCheck = [
      { value: 'AV1', label: 'AV1', mimes: ['video/mp4;codecs=av01', 'video/webm;codecs=av01'] },
      { value: 'H265', label: 'H.265 (HEVC)', mimes: ['video/mp4;codecs=hvc1', 'video/mp4;codecs=hev1'] },
      { value: 'H264', label: 'H.264 (AVC)', mimes: ['video/mp4;codecs=avc1', 'video/webm;codecs=h264'] },
      { value: 'VP9', label: 'VP9', mimes: ['video/webm;codecs=vp9', 'video/mp4;codecs=vp09'] },
      { value: 'VP8', label: 'VP8', mimes: ['video/webm;codecs=vp8'] },
    ];
    const aCodecsToCheck = [
      { value: 'Opus', label: 'Opus', mimes: ['audio/webm;codecs=opus', 'video/webm;codecs=vp8,opus'] },
      { value: 'AAC', label: 'AAC', mimes: ['audio/mp4;codecs=mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2'] },
    ];

    const availableVCodecs = [{ name: 'Auto (Best Available)', value: 'Auto' }];
    const availableACodecs = [{ name: 'Auto (Best Available)', value: 'Auto' }];
    
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      for (const codec of vCodecsToCheck) {
        if (codec.mimes.some(mime => MediaRecorder.isTypeSupported(mime))) {
          availableVCodecs.push({ name: codec.label, value: codec.value });
        }
      }
      for (const codec of aCodecsToCheck) {
        if (codec.mimes.some(mime => MediaRecorder.isTypeSupported(mime))) {
          availableACodecs.push({ name: codec.label, value: codec.value });
        }
      }
    }
    setSupportedVideoCodecs(availableVCodecs);
    setSupportedAudioCodecs(availableACodecs);
  }, []);

  const [overlayConfig, setOverlayConfig] = useState(() => {
    const saved = localStorage.getItem('dashcam_overlay_config');
    const defaultConfig = {
      speed: true,
      grade: true,
      gps: true,
      gpsSmoothing: 3,
      timestamp: true,
      heartRate: true,
      maxHeartRate: 180,
      hrSmoothing: 3,
      hrCalibration: 0,
      power: true,
      ftp: 200,
      powerSmoothing: 3,
      powerCalibration: 0,
      useMph: false,
      loopMode: false,
      gSensor: true, // New: Enable G-sensor detection
      gThreshold: 2.5, // New: G-force threshold for incident (2.5G is a heavy impact)
      videoQuality: '1080p', // '4K', '1080p', '720p'
      videoOrientation: 'Auto', // 'Auto', 'Landscape', 'Portrait'
      videoFramerate: 'Auto', // 'Auto', '60', '30', '24'
      audioQuality: 'Raw', // 'Raw', 'Processed', 'Muted'
      videoCodec: 'H264', // 'Auto', 'AV1', 'H265', 'H264', 'VP9', 'VP8'
      audioCodec: 'AAC', // 'Auto', 'Opus', 'AAC'
      videoBitrate: '8000000', // 'Auto', '50000000', '30000000', '15000000', '8000000', '4000000', '2500000', '1000000'
      audioBitrate: 'Auto', // 'Auto', '320000', '256000', '192000', '128000', '64000'
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        delete parsed.altitude; // Remove altitude if it was saved
        return { ...defaultConfig, ...parsed };
      } catch (e) {
        console.error('Failed to parse saved config', e);
      }
    }
    return defaultConfig;
  });

  useEffect(() => {
    localStorage.setItem('dashcam_overlay_config', JSON.stringify(overlayConfig));
  }, [overlayConfig]);

  // Recording-related refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const loopAudioCtxRef = useRef<AudioContext | null>(null);
  const loopAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const loopAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordAudioCtxRef = useRef<AudioContext | null>(null);
  const recordAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Blob[]>([]); // Stores recorded video chunks
  const animationRef = useRef<number>(0); // ID for the requestAnimationFrame loop

  // Custom hook to get real-time GPS and movement data
  const telemetry = useTelemetry(overlayConfig.gpsSmoothing);
  const telemetryRef = useRef(telemetry);

  const { heartRate, connect: connectHeartRate, disconnect: disconnectHeartRate, isConnected: isHeartRateConnected, isConnecting: isHeartRateConnecting, error: heartRateError } = useHeartRateMonitor(overlayConfig.hrSmoothing, overlayConfig.hrCalibration);
  const heartRateRef = useRef(heartRate);

  const { power, connect: connectPowerMeter, disconnect: disconnectPowerMeter, isConnected: isPowerMeterConnected, isConnecting: isPowerMeterConnecting, error: powerMeterError } = usePowerMeter(overlayConfig.powerSmoothing, overlayConfig.powerCalibration);
  const powerRef = useRef(power);

  // Auto-connect to sensors on startup if they were previously saved
  useEffect(() => {
    const hrSaved = localStorage.getItem('dashcam_hr_device_id');
    if (hrSaved) {
      connectHeartRate({ autoConnectOnly: true });
    }
    const pmSaved = localStorage.getItem('dashcam_pm_device_id');
    if (pmSaved) {
      connectPowerMeter({ autoConnectOnly: true });
    }
  }, [connectHeartRate, connectPowerMeter]);

  // Keep ref updated so the high-frequency animation loop always has fresh data
  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    heartRateRef.current = heartRate;
  }, [heartRate]);

  useEffect(() => {
    powerRef.current = power;
  }, [power]);

  // Check for updates on mount
  useEffect(() => {
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== APP_VERSION) {
      setShowUpdateBanner(true);
    }
  }, []);

  const handleForceUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    caches.keys().then(names => {
      for (let name of names) caches.delete(name);
    });
    localStorage.setItem('app_version', APP_VERSION);
    window.location.reload();
  };
  // Camera Setup: Initialize the camera and audio
  useEffect(() => {
    let stream: MediaStream | null = null;
    async function setupCamera() {
      try {
        // Stop any existing tracks before requesting new ones
        if (videoRef.current?.srcObject) {
          const oldStream = videoRef.current.srcObject as MediaStream;
          oldStream.getTracks().forEach(track => track.stop());
        }

        let videoConstraints: any = { facingMode: facingMode };
        if (overlayConfig.videoFramerate && overlayConfig.videoFramerate !== 'Auto') {
          const fps = parseInt(overlayConfig.videoFramerate, 10);
          videoConstraints.frameRate = { ideal: fps, min: fps - 5 };
        } else {
          videoConstraints.frameRate = { ideal: 60, min: 30 };
        }
        
        let targetWidth, targetHeight;
        if (overlayConfig.videoQuality === '4K') {
          targetWidth = { ideal: 3840, min: 1920 };
          targetHeight = { ideal: 2160, min: 1080 };
        } else if (overlayConfig.videoQuality === '1080p') {
          targetWidth = { ideal: 1920 };
          targetHeight = { ideal: 1080 };
        } else if (overlayConfig.videoQuality === '720p') {
          targetWidth = { ideal: 1280 };
          targetHeight = { ideal: 720 };
        }

        if (overlayConfig.videoOrientation === 'Landscape') {
          videoConstraints.width = targetWidth;
          videoConstraints.height = targetHeight;
          videoConstraints.aspectRatio = { ideal: 16/9 };
        } else if (overlayConfig.videoOrientation === 'Portrait') {
          videoConstraints.width = targetHeight;
          videoConstraints.height = targetWidth;
          videoConstraints.aspectRatio = { ideal: 9/16 };
        } else {
          videoConstraints.width = targetWidth;
          videoConstraints.height = targetHeight;
        }

        let audioConstraints: any = true;
        if (overlayConfig.audioQuality === 'Muted') {
          audioConstraints = false;
        } else if (overlayConfig.audioQuality === 'Raw') {
          audioConstraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000,
            channelCount: 2
          };
        } else if (overlayConfig.audioQuality === 'Processed') {
          audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 2
          };
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Check supported framerates
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
            const capabilities = videoTrack.getCapabilities();
            if (capabilities.frameRate) {
              const maxFps = Math.floor((capabilities.frameRate as any).max || 30);
              const fpsOptions = [{ name: 'Auto (Best Available)', value: 'Auto' }];
              if (maxFps >= 60) fpsOptions.push({ name: '60 FPS', value: '60' });
              if (maxFps >= 30) fpsOptions.push({ name: '30 FPS', value: '30' });
              if (maxFps >= 24) fpsOptions.push({ name: '24 FPS', value: '24' });
              setSupportedFramerates(fpsOptions);
            }
          }

          // Reconnect audio sources if recording is active
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            if (loopAudioCtxRef.current && loopAudioDestRef.current) {
              if (loopAudioSourceRef.current) {
                try { loopAudioSourceRef.current.disconnect(); } catch(e) {}
              }
              try {
                const newSource = loopAudioCtxRef.current.createMediaStreamSource(new MediaStream([audioTracks[0]]));
                loopAudioSourceRef.current = newSource;
                newSource.connect(loopAudioDestRef.current);
              } catch (e) { console.error("Failed to reconnect loop audio", e); }
            }
            if (recordAudioCtxRef.current && recordAudioDestRef.current) {
              if (recordAudioSourceRef.current) {
                try { recordAudioSourceRef.current.disconnect(); } catch(e) {}
              }
              try {
                const newSource = recordAudioCtxRef.current.createMediaStreamSource(new MediaStream([audioTracks[0]]));
                recordAudioSourceRef.current = newSource;
                newSource.connect(recordAudioDestRef.current);
              } catch (e) { console.error("Failed to reconnect record audio", e); }
            }
          }

          // Use a more robust play sequence
          videoRef.current.load();
          videoRef.current.play()
            .then(() => {
              setHasCamera(true);
            })
            .catch(e => {
              console.error("Video play failed:", e);
              // Try again on next tick if it failed
              setTimeout(() => videoRef.current?.play(), 100);
            });
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        // Fallback: Try any available camera if preferred mode fails
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: overlayConfig.audioQuality === 'Muted' ? false : true 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            
            // Reconnect audio sources if recording is active
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
              if (loopAudioCtxRef.current && loopAudioDestRef.current) {
                if (loopAudioSourceRef.current) {
                  try { loopAudioSourceRef.current.disconnect(); } catch(e) {}
                }
                try {
                  const newSource = loopAudioCtxRef.current.createMediaStreamSource(new MediaStream([audioTracks[0]]));
                  loopAudioSourceRef.current = newSource;
                  newSource.connect(loopAudioDestRef.current);
                } catch (e) { console.error("Failed to reconnect loop audio", e); }
              }
              if (recordAudioCtxRef.current && recordAudioDestRef.current) {
                if (recordAudioSourceRef.current) {
                  try { recordAudioSourceRef.current.disconnect(); } catch(e) {}
                }
                try {
                  const newSource = recordAudioCtxRef.current.createMediaStreamSource(new MediaStream([audioTracks[0]]));
                  recordAudioSourceRef.current = newSource;
                  newSource.connect(recordAudioDestRef.current);
                } catch (e) { console.error("Failed to reconnect record audio", e); }
              }
            }

            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(e => console.error("Video play failed:", e));
              setHasCamera(true);
            };
          }
        } catch (fallbackErr) {
          console.error('Fallback camera failed:', fallbackErr);
        }
      }
    }
    setupCamera();

    // Cleanup: Stop camera tracks when the component unmounts
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode, overlayConfig.videoQuality, overlayConfig.videoOrientation, overlayConfig.videoFramerate, overlayConfig.audioQuality]); // Re-run when facingMode or quality changes

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Loop Mode Logic: Maintains a rolling buffer of the last 60 seconds in RAM
  const startLoopRecording = () => {
    if (!canvasRef.current || isLooping || !hasCamera) return;
    if (isRecording) stopRecording();

    const canvasStream = canvasRef.current.captureStream(60);
    if (videoRef.current?.srcObject) {
      const audioTracks = (videoRef.current.srcObject as MediaStream).getAudioTracks();
      if (audioTracks.length > 0) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          loopAudioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
          loopAudioSourceRef.current = source;
          const destination = audioCtx.createMediaStreamDestination();
          destination.channelCount = 2;
          destination.channelCountMode = 'explicit';
          destination.channelInterpretation = 'speakers';
          loopAudioDestRef.current = destination;
          source.connect(destination);
          canvasStream.addTrack(destination.stream.getAudioTracks()[0]);
        } catch (e) {
          console.error("Web Audio API failed", e);
          canvasStream.addTrack(audioTracks[0]);
        }
      }
    }

    const mimeType = getSupportedMimeType(overlayConfig.videoCodec, overlayConfig.audioCodec);

    let videoBitsPerSecond = overlayConfig.videoQuality === '4K' ? 16000000 : overlayConfig.videoQuality === '1080p' ? 8000000 : 4000000;
    if (overlayConfig.videoBitrate !== 'Auto') {
      videoBitsPerSecond = parseInt(overlayConfig.videoBitrate, 10);
    }

    let audioBitsPerSecond = 192000;
    if (overlayConfig.audioBitrate !== 'Auto') {
      audioBitsPerSecond = parseInt(overlayConfig.audioBitrate, 10);
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond,
      audioBitsPerSecond,
      audioChannels: 2
    } as any);

    loopRecorderRef.current = recorder;
    loopChunksRef.current = [];
    loopHeaderChunkRef.current = null;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        const now = Date.now();
        
        // The first chunk contains the essential metadata/header
        if (!loopHeaderChunkRef.current) {
          loopHeaderChunkRef.current = e.data;
        } else {
          loopChunksRef.current.push({ blob: e.data, timestamp: now });
        }

        // Remove chunks older than the loop duration
        const cutoff = now - LOOP_DURATION;
        loopChunksRef.current = loopChunksRef.current.filter(c => c.timestamp > cutoff);
      }
    };

    recorder.start(CHUNK_INTERVAL); // Request data every 5 seconds
    setIsLooping(true);
    console.log("Loop Mode Started");
  };

  const stopLoopRecording = () => {
    if (loopRecorderRef.current) {
      try {
        if (loopRecorderRef.current.state !== 'inactive') {
          loopRecorderRef.current.stop();
        }
      } catch (e) {
        console.error("Error stopping loop recorder:", e);
      }
    }
    setIsLooping(false);
    loopChunksRef.current = [];
    loopHeaderChunkRef.current = null;
    console.log("Loop Mode Stopped");
    if (loopAudioCtxRef.current) {
      loopAudioCtxRef.current.close().catch(console.error);
      loopAudioCtxRef.current = null;
      loopAudioDestRef.current = null;
      loopAudioSourceRef.current = null;
    }
  };

  const saveLoopIncident = async () => {
    if (!loopRecorderRef.current || !isLooping) return;

    // Force the recorder to give us the current data slice immediately
    // This ensures we save right up to the current moment
    loopRecorderRef.current.requestData();
    
    // Wait a brief moment for ondataavailable to fire and update our refs
    await new Promise(resolve => setTimeout(resolve, 250));

    if (!loopHeaderChunkRef.current) {
      alert("Loop buffer is still warming up. Please wait a few seconds.");
      return;
    }

    // Combine the header with the rolling window of chunks
    const allBlobs = [
      loopHeaderChunkRef.current,
      ...loopChunksRef.current.map(c => c.blob)
    ];

    const blob = new Blob(allBlobs, { type: loopRecorderRef.current?.mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const timestamp = getLocalTimestamp();
    const ext = loopRecorderRef.current?.mimeType.includes('mp4') ? 'mp4' : 'webm';
    a.download = `Incident_${timestamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
    
    console.log("Incident Saved from Loop Buffer");
  };

  // Stop loop mode if settings change or regular recording starts
  useEffect(() => {
    if (!overlayConfig.loopMode || isRecording) {
      stopLoopRecording();
    }
    return () => stopLoopRecording();
  }, [overlayConfig.loopMode, isRecording]);

  const lastIncidentTime = useRef(0);
  const INCIDENT_COOLDOWN = 10000; // 10 seconds cooldown

  // G-Force Incident Detection
  useEffect(() => {
    if (!overlayConfig.loopMode || !overlayConfig.gSensor || !isLooping) return;

    const currentG = telemetry.gForce.total;
    const now = Date.now();

    // Check if G-force exceeds threshold and cooldown has passed
    if (currentG > overlayConfig.gThreshold && now - lastIncidentTime.current > INCIDENT_COOLDOWN) {
      console.warn(`G-Force Incident Detected: ${currentG.toFixed(2)}G`);
      lastIncidentTime.current = now;
      saveLoopIncident();
      
      // Optional: Visual feedback
      const originalColor = document.body.style.backgroundColor;
      document.body.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
      setTimeout(() => {
        document.body.style.backgroundColor = originalColor;
      }, 500);
    }
  }, [telemetry.gForce.total, overlayConfig.loopMode, overlayConfig.gSensor, isLooping]);

  // Animation Loop: The heart of the app. Draws video frames + telemetry to the canvas.
  useEffect(() => {
    if (!hasCamera) return;

    const draw = () => {
      if (!canvasRef.current || !videoRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const video = videoRef.current;
      
      // Skip drawing if video isn't ready
      if (video.paused || video.ended || video.readyState < 2) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const { videoWidth, videoHeight } = video;
      if (videoWidth === 0 || videoHeight === 0) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // Ensure canvas resolution matches the incoming video source
      if (canvasRef.current.width !== videoWidth) {
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;
      }

      // 1. Draw the raw video frame
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // 2. Setup styles for telemetry text
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; // Dark outline for readability
      ctx.lineWidth = 4;
      
      const pad = videoWidth * 0.05; // 5% padding from edges
      const titleSize = Math.max(24, videoWidth * 0.06);
      const subSize = Math.max(12, videoWidth * 0.03);
      
      ctx.font = `bold ${titleSize}px "Google Sans", sans-serif`;
      ctx.textBaseline = 'top';

      const data = telemetryRef.current;
      const config = overlayConfig;

      // 3. Draw Overlays (Speed, Altitude, GPS, Time)
      
      let leftYOffset = pad + (titleSize * 2);
      let rightYOffset = pad + (titleSize * 2);

      // Top Left: Speed
      if (config.speed) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `bold ${titleSize}px "Google Sans", sans-serif`;
        const speed = config.useMph ? data.speedKmh * 0.621371 : data.speedKmh;
        const unit = config.useMph ? 'MPH' : 'KM/H';
        const speedText = `${Math.round(speed)} ${unit}`;
        ctx.strokeText(speedText, pad, leftYOffset);
        ctx.fillText(speedText, pad, leftYOffset);
        leftYOffset += titleSize + 10;
      }

      // Top Right: Altitude & Climb Rate
      // (Altitude removed as per user request, Grade kept)
      if (config.grade) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = `bold ${subSize}px "Google Sans", sans-serif`;
        const climbText = `GRADE: ${data.climbRatePct > 0 ? '+' : ''}${data.climbRatePct.toFixed(1)}%`;
        ctx.strokeText(climbText, videoWidth - pad, rightYOffset);
        ctx.fillText(climbText, videoWidth - pad, rightYOffset);
        rightYOffset += subSize + 10;
      }

      // Top Right: Heart Rate (Below Altitude)
      if (config.heartRate && heartRateRef.current !== null) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = `bold ${subSize}px "Google Sans", sans-serif`;
        const hr = heartRateRef.current;
        const maxHr = config.maxHeartRate || 180;
        const hrPercent = Math.round((hr / maxHr) * 100);
        const hrText = `HR(bpm): ${hr} %${hrPercent}`;
        ctx.strokeText(hrText, videoWidth - pad, rightYOffset);
        ctx.fillText(hrText, videoWidth - pad, rightYOffset);
        rightYOffset += subSize + 10;
      }

      // Top Right: Power Meter (Below HR)
      if (config.power && powerRef.current !== null) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = `bold ${subSize}px "Google Sans", sans-serif`;
        const pwr = powerRef.current;
        const ftp = config.ftp || 200;
        const pwrPercent = Math.round((pwr / ftp) * 100);
        const pwrText = `PM(watt): ${pwr} %${pwrPercent}`;
        ctx.strokeText(pwrText, videoWidth - pad, rightYOffset);
        ctx.fillText(pwrText, videoWidth - pad, rightYOffset);
        rightYOffset += subSize + 10;
      }

      // Bottom Left: GPS Coordinates
      if (config.gps) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.font = `bold ${subSize}px "Google Sans", sans-serif`;
        const gpsText = `${data.latitude.toFixed(6)}N ${data.longitude.toFixed(6)}E`;
        ctx.strokeText(gpsText, pad, videoHeight - pad);
        ctx.fillText(gpsText, pad, videoHeight - pad);
      }

      // Bottom Right: Real-time Timestamp
      if (config.timestamp) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.font = `bold ${subSize}px "Google Sans", sans-serif`;
        const timeText = new Date().toLocaleString();
        ctx.strokeText(timeText, videoWidth - pad, videoHeight - pad);
        ctx.fillText(timeText, videoWidth - pad, videoHeight - pad);
      }

      // Request the next frame (usually 60fps)
      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animationRef.current);
  }, [hasCamera, facingMode]); // Re-run when camera status OR facing mode changes

  // Recording Logic: Captures the canvas (video + overlays) as a video file
  const startRecording = () => {
    if (!canvasRef.current || isRecording) return;
    if (isLooping) stopLoopRecording();
    
    // 1. Capture the canvas stream at 60fps
    const canvasStream = canvasRef.current.captureStream(60);
    
    // 2. Mix in the audio track from the camera microphone
    if (videoRef.current?.srcObject) {
      const audioTracks = (videoRef.current.srcObject as MediaStream).getAudioTracks();
      if (audioTracks.length > 0) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          recordAudioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
          recordAudioSourceRef.current = source;
          const destination = audioCtx.createMediaStreamDestination();
          destination.channelCount = 2;
          destination.channelCountMode = 'explicit';
          destination.channelInterpretation = 'speakers';
          recordAudioDestRef.current = destination;
          source.connect(destination);
          canvasStream.addTrack(destination.stream.getAudioTracks()[0]);
        } catch (e) {
          console.error("Web Audio API failed", e);
          canvasStream.addTrack(audioTracks[0]);
        }
      }
    }

    // 3. Determine best supported video format
    const selectedMimeType = getSupportedMimeType(overlayConfig.videoCodec, overlayConfig.audioCodec);

    let videoBitsPerSecond = overlayConfig.videoQuality === '4K' ? 30000000 : overlayConfig.videoQuality === '1080p' ? 15000000 : 8000000;
    if (overlayConfig.videoBitrate !== 'Auto') {
      videoBitsPerSecond = parseInt(overlayConfig.videoBitrate, 10);
    }

    let audioBitsPerSecond = 192000;
    if (overlayConfig.audioBitrate !== 'Auto') {
      audioBitsPerSecond = parseInt(overlayConfig.audioBitrate, 10);
    }

    // 4. Initialize MediaRecorder
    const mediaRecorder = new MediaRecorder(canvasStream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond,
      audioBitsPerSecond,
      audioChannels: 2
    } as any);

    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    // Store data as it becomes available
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    // When recording stops, compile chunks into a file and trigger download
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: selectedMimeType || 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const timestamp = getLocalTimestamp();
      const ext = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';
      a.download = `Recording_${timestamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordAudioCtxRef.current) {
        recordAudioCtxRef.current.close().catch(console.error);
        recordAudioCtxRef.current = null;
        recordAudioDestRef.current = null;
        recordAudioSourceRef.current = null;
      }
    }
  };

  // Snapshot Logic: Captures a single JPEG frame from the canvas
  const takeSnapshot = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/jpeg', 0.9);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const timestamp = getLocalTimestamp();
    a.download = `Snapshot_${timestamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  };

  const requestMotionPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        if (permission === 'granted') {
          console.log('Motion permission granted');
          window.location.reload(); // Reload to start listeners
        }
      } catch (err) {
        console.error('Error requesting motion permission:', err);
      }
    } else {
      alert('Motion sensor is already active or not supported on this device.');
    }
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {/* Update Banner */}
      <AnimatePresence>
        {showUpdateBanner && (
          <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-4 left-4 right-4 z-[100] bg-amber-500 text-black p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-amber-400"
          >
            <div className="flex-1">
              <p className="font-bold text-sm uppercase tracking-tight">Update Available!</p>
              <p className="text-[11px] opacity-80">A new version (v{APP_VERSION}) is ready. Please update to fix installation issues.</p>
            </div>
            <button
              onClick={handleForceUpdate}
              className="px-4 py-2 bg-black text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg active:scale-95"
            >
              Update Now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer 1: Hidden video element to capture raw camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        webkit-playsinline="true"
        className="hidden"
      />

      {/* Layer 2: Visible canvas where video + telemetry overlays are composited */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
      />

      {/* Layer 3: Top Controls (Fullscreen & Settings) */}
      <div className="absolute top-8 left-8 right-8 flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <div className="flex gap-4">
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(e => console.warn(e));
                } else {
                  document.exitFullscreen();
                }
              }}
              className="w-12 h-12 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            </button>

            <button
              onPointerDown={() => handleSensorPointerDown('hr')}
              onPointerUp={(e) => handleSensorPointerUp(e, () => isHeartRateConnected ? disconnectHeartRate() : connectHeartRate())}
              onPointerLeave={() => {
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              disabled={isHeartRateConnecting}
              className={`w-12 h-12 backdrop-blur-md border rounded-full flex items-center justify-center transition-all touch-none ${
                isHeartRateConnected ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30' : 
                heartRateError ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30' :
                isHeartRateConnecting ? 'bg-black/40 border-white/20 text-white/50 animate-pulse' : 
                'bg-black/40 border-white/20 text-white hover:bg-black/60'
              }`}
              title={isHeartRateConnected ? "Disconnect Heart Rate (Long press for menu)" : heartRateError ? `Error: ${heartRateError}` : "Connect Heart Rate (Long press for menu)"}
            >
              <Heart className={`w-6 h-6 ${isHeartRateConnected ? 'fill-emerald-400' : ''}`} />
            </button>

            <button
              onPointerDown={() => handleSensorPointerDown('pm')}
              onPointerUp={(e) => handleSensorPointerUp(e, () => isPowerMeterConnected ? disconnectPowerMeter() : connectPowerMeter())}
              onPointerLeave={() => {
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              disabled={isPowerMeterConnecting}
              className={`w-12 h-12 backdrop-blur-md border rounded-full flex items-center justify-center transition-all touch-none ${
                isPowerMeterConnected ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30' : 
                powerMeterError ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30' :
                isPowerMeterConnecting ? 'bg-black/40 border-white/20 text-white/50 animate-pulse' : 
                'bg-black/40 border-white/20 text-white hover:bg-black/60'
              }`}
              title={isPowerMeterConnected ? "Disconnect Power Meter (Long press for menu)" : powerMeterError ? `Error: ${powerMeterError}` : "Connect Power Meter (Long press for menu)"}
            >
              <Zap className={`w-6 h-6 ${isPowerMeterConnected ? 'fill-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* GPS Status Indicator */}
          <div 
            className="flex items-center gap-1.5 px-3 h-12 bg-black/40 backdrop-blur-md border border-white/20 rounded-full text-white cursor-pointer select-none active:scale-95 transition-transform"
            title={telemetry.altitude !== null ? "3D GPS Lock (Altitude Available)" : "2D GPS Lock (No Altitude)"}
            onPointerDown={() => handleSensorPointerDown('gps')}
            onPointerUp={(e) => handleSensorPointerUp(e, () => {})} // No single-click action for GPS
            onPointerLeave={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
          >
            <div className="flex flex-col items-center leading-none">
              <span className={`text-[10px] font-black uppercase tracking-tighter ${telemetry.altitude !== null ? 'text-emerald-400' : 'text-orange-400'}`}>
                GPS {telemetry.altitude !== null ? '3D' : '2D'}
              </span>
              <span className="text-xs font-bold tabular-nums">
                {telemetry.accuracy ? `±${Math.round(telemetry.accuracy)}m` : '---'}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              if (!showSettings) {
                window.history.pushState({ menu: 'settings' }, '');
                setShowSettings(true);
              } else {
                window.history.back();
              }
            }}
            className="w-12 h-12 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all"
          >
            <Settings className={`w-6 h-6 transition-transform ${showSettings ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Layer 4: Settings Panel (Overlay Configuration) */}
      <AnimatePresence>
        {sensorMenu && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-xs bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/5 bg-white/5">
                <h3 className="text-white font-medium flex items-center gap-2">
                  {sensorMenu === 'hr' ? <Heart className="w-4 h-4 text-emerald-400" /> : 
                   sensorMenu === 'pm' ? <Zap className="w-4 h-4 text-emerald-400" /> :
                   <Navigation className="w-4 h-4 text-emerald-400" />}
                  {sensorMenu === 'hr' ? 'Heart Rate Sensor' : 
                   sensorMenu === 'pm' ? 'Power Meter Sensor' :
                   'GPS & Telemetry'}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {/* Sensor Specific Settings */}
                <div className="space-y-4">
                  {sensorMenu === 'gps' ? (
                    <>
                      <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Show GPS Overlay</span>
                        <input
                          type="checkbox"
                          checked={overlayConfig.gps}
                          onChange={() => setOverlayConfig(prev => ({ ...prev, gps: !prev.gps }))}
                          className="sr-only"
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors relative ${overlayConfig.gps ? 'bg-emerald-500' : 'bg-white/10'}`}>
                          <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${overlayConfig.gps ? 'left-6' : 'left-1'}`} />
                        </div>
                      </label>
                      <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Show Speed Overlay</span>
                        <input
                          type="checkbox"
                          checked={overlayConfig.speed}
                          onChange={() => setOverlayConfig(prev => ({ ...prev, speed: !prev.speed }))}
                          className="sr-only"
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors relative ${overlayConfig.speed ? 'bg-emerald-500' : 'bg-white/10'}`}>
                          <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${overlayConfig.speed ? 'left-6' : 'left-1'}`} />
                        </div>
                      </label>
                      <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Show Grade Overlay</span>
                        <input
                          type="checkbox"
                          checked={overlayConfig.grade}
                          onChange={() => setOverlayConfig(prev => ({ ...prev, grade: !prev.grade }))}
                          className="sr-only"
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors relative ${overlayConfig.grade ? 'bg-emerald-500' : 'bg-white/10'}`}>
                          <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${overlayConfig.grade ? 'left-6' : 'left-1'}`} />
                        </div>
                      </label>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Smoothing</span>
                        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                          <button 
                            onClick={() => setOverlayConfig(prev => ({ ...prev, gpsSmoothing: Math.max(1, prev.gpsSmoothing - 1) }))}
                            className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={overlayConfig.gpsSmoothing}
                            readOnly
                            className="w-8 bg-transparent border-none text-center font-mono text-sm text-white focus:outline-none"
                          />
                          <button 
                            onClick={() => setOverlayConfig(prev => ({ ...prev, gpsSmoothing: Math.min(20, prev.gpsSmoothing + 1) }))}
                            className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-xs text-white/50 font-mono uppercase tracking-wider">
                        Show {sensorMenu === 'hr' ? 'Heart Rate' : 'Power'} Overlay
                      </span>
                      <input
                        type="checkbox"
                        checked={sensorMenu === 'hr' ? overlayConfig.heartRate : overlayConfig.power}
                        onChange={() => {
                          if (sensorMenu === 'hr') setOverlayConfig(prev => ({ ...prev, heartRate: !prev.heartRate }));
                          else setOverlayConfig(prev => ({ ...prev, power: !prev.power }));
                        }}
                        className="sr-only"
                      />
                      <div className={`w-10 h-5 rounded-full transition-colors relative ${ (sensorMenu === 'hr' ? overlayConfig.heartRate : overlayConfig.power) ? 'bg-emerald-500' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${ (sensorMenu === 'hr' ? overlayConfig.heartRate : overlayConfig.power) ? 'left-6' : 'left-1'}`} />
                      </div>
                    </label>
                  )}

                  {sensorMenu !== 'gps' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Smoothing</span>
                        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                          <button 
                            onClick={() => {
                              const key = sensorMenu === 'hr' ? 'hrSmoothing' : 'powerSmoothing';
                              setOverlayConfig(prev => ({ ...prev, [key]: Math.max(1, (prev[key] as number) - 1) }));
                            }}
                            className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={sensorMenu === 'hr' ? overlayConfig.hrSmoothing : overlayConfig.powerSmoothing}
                            readOnly
                            className="w-8 bg-transparent border-none text-center font-mono text-sm text-white focus:outline-none"
                          />
                          <button 
                            onClick={() => {
                              const key = sensorMenu === 'hr' ? 'hrSmoothing' : 'powerSmoothing';
                              setOverlayConfig(prev => ({ ...prev, [key]: Math.min(20, (prev[key] as number) + 1) }));
                            }}
                            className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Calibration</span>
                        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                          <button 
                            onClick={() => {
                              const key = sensorMenu === 'hr' ? 'hrCalibration' : 'powerCalibration';
                              setOverlayConfig(prev => ({ ...prev, [key]: (prev[key] as number) - 1 }));
                            }}
                            className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={sensorMenu === 'hr' ? overlayConfig.hrCalibration : overlayConfig.powerCalibration}
                            readOnly
                            className="w-8 bg-transparent border-none text-center font-mono text-sm text-white focus:outline-none"
                          />
                          <button 
                            onClick={() => {
                              const key = sensorMenu === 'hr' ? 'hrCalibration' : 'powerCalibration';
                              setOverlayConfig(prev => ({ ...prev, [key]: (prev[key] as number) + 1 }));
                            }}
                            className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/50 font-mono uppercase tracking-wider">
                          {sensorMenu === 'hr' ? 'Max Heart Rate' : 'Max FTP'}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={sensorMenu === 'hr' ? "100" : "50"}
                            max={sensorMenu === 'hr' ? "250" : "600"}
                            value={(sensorMenu === 'hr' ? overlayConfig.maxHeartRate : overlayConfig.ftp) || (sensorMenu === 'hr' ? 180 : 200)}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (sensorMenu === 'hr') setOverlayConfig(prev => ({ ...prev, maxHeartRate: val || 180 }));
                              else setOverlayConfig(prev => ({ ...prev, ftp: val || 200 }));
                            }}
                            className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 font-mono text-sm text-white text-center focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                          <span className="text-[10px] text-white/30 font-mono uppercase">{sensorMenu === 'hr' ? 'BPM' : 'W'}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-white/30 leading-tight">
                        {sensorMenu === 'hr' 
                          ? 'Used to calculate heart rate zones and percentage.' 
                          : 'Used to calculate power zones and intensity.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {sensorMenu !== 'gps' && (
                <>
                  <div className="h-px bg-white/5" />
                  <div className="p-4 space-y-1">
                    <button
                      onClick={() => {
                        if (sensorMenu === 'hr') connectHeartRate({ forcePicker: true });
                        else connectPowerMeter({ forcePicker: true });
                        window.history.back();
                      }}
                      className="w-full p-3 text-left text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"
                    >
                      <RefreshCw className="w-5 h-5 text-blue-400" />
                      <span>Sensors</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}

        {showSettings && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="absolute top-24 right-8 w-64 max-h-[calc(100vh-8rem)] overflow-y-auto bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white z-50 shadow-2xl custom-scrollbar"
          >
            <h3 className="font-mono text-xs uppercase tracking-widest opacity-50 mb-4">Overlay Config</h3>
            <div className="space-y-3">
              {/* PWA Install Button (Always visible) */}
              <div className="space-y-2">
                <button
                  onClick={handleInstallClick}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-mono text-sm transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 border border-emerald-400/30"
                >
                  <Download className="w-4 h-4" />
                  INSTALL
                </button>

                <button
                  onClick={() => {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(registrations => {
                        for (let registration of registrations) {
                          registration.update();
                        }
                        window.location.reload();
                      });
                    } else {
                      window.location.reload();
                    }
                  }}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/50 rounded-lg font-mono text-[10px] transition-all flex items-center justify-center gap-2 border border-white/10"
                >
                  <RefreshCw className="w-3 h-3" />
                  FORCE UPDATE
                </button>
                
                <AnimatePresence>
                  {installStatus && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`p-3 rounded-lg text-[11px] font-mono leading-relaxed border ${
                        installStatus === 'success' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' :
                        installStatus === 'iframe' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' :
                        'bg-white/5 border-white/10 text-white/70'
                      }`}>
                        {installStatus === 'iframe' && (
                          <>
                            <p className="font-bold mb-1 uppercase">Preview Mode Detected</p>
                            <p>Installation is blocked in this preview window. Please open the app directly in a new tab to install.</p>
                          </>
                        )}
                        {installStatus === 'manual' && (
                          <>
                            <p className="font-bold mb-1 uppercase">Manual Install Required</p>
                            <p>iOS: Tap <b>Share</b> → <b>Add to Home Screen</b></p>
                            <p className="mt-1">Android/Chrome: Tap <b>Menu</b> → <b>Install App</b></p>
                          </>
                        )}
                        {installStatus === 'already-installed' && (
                          <p>App is already installed and running in standalone mode.</p>
                        )}
                        {installStatus === 'dismissed' && (
                          <p>Installation was cancelled.</p>
                        )}
                        {installStatus === 'error' && (
                          <p className="text-red-400">An error occurred during installation.</p>
                        )}
                        {installStatus === 'success' && (
                          <p>Installation started successfully!</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="h-px bg-white/10 my-4" />

              {/* Recording Quality Settings */}
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Video Orientation</span>
                  <select
                    value={overlayConfig.videoOrientation}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, videoOrientation: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Auto" className="bg-black">Auto (Device Default)</option>
                    <option value="Landscape" className="bg-black">Landscape (16:9)</option>
                    <option value="Portrait" className="bg-black">Portrait (9:16)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Video Quality</span>
                  <select
                    value={overlayConfig.videoQuality}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, videoQuality: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="4K" className="bg-black">4K (Highest)</option>
                    <option value="1080p" className="bg-black">1080p (High)</option>
                    <option value="720p" className="bg-black">720p (Standard)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Audio Quality</span>
                  <select
                    value={overlayConfig.audioQuality}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, audioQuality: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Raw" className="bg-black">Raw (Best for wind/env)</option>
                    <option value="Processed" className="bg-black">Processed (Voice focus)</option>
                    <option value="Muted" className="bg-black">Muted (No audio)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Video Framerate</span>
                  <select
                    value={overlayConfig.videoFramerate}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, videoFramerate: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {supportedFramerates.map(fps => (
                      <option key={fps.value} value={fps.value} className="bg-black">{fps.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Video Codec</span>
                  <select
                    value={overlayConfig.videoCodec}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, videoCodec: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {supportedVideoCodecs.map(codec => (
                      <option key={codec.value} value={codec.value} className="bg-black">{codec.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Audio Codec</span>
                  <select
                    value={overlayConfig.audioCodec}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, audioCodec: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {supportedAudioCodecs.map(codec => (
                      <option key={codec.value} value={codec.value} className="bg-black">{codec.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Video Bitrate</span>
                  <select
                    value={overlayConfig.videoBitrate || 'Auto'}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, videoBitrate: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Auto" className="bg-black">Auto (Based on Quality)</option>
                    <option value="50000000" className="bg-black">50 Mbps (Insane)</option>
                    <option value="30000000" className="bg-black">30 Mbps (Very High)</option>
                    <option value="20000000" className="bg-black">20 Mbps (High)</option>
                    <option value="15000000" className="bg-black">15 Mbps (Good)</option>
                    <option value="10000000" className="bg-black">10 Mbps (Standard)</option>
                    <option value="8000000" className="bg-black">8 Mbps (Medium)</option>
                    <option value="4000000" className="bg-black">4 Mbps (Low)</option>
                    <option value="2500000" className="bg-black">2.5 Mbps (Very Low)</option>
                    <option value="1000000" className="bg-black">1 Mbps (Potato)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">Audio Bitrate</span>
                  <select
                    value={overlayConfig.audioBitrate || 'Auto'}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, audioBitrate: e.target.value }))}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Auto" className="bg-black">Auto (192 kbps)</option>
                    <option value="320000" className="bg-black">320 kbps (Studio)</option>
                    <option value="256000" className="bg-black">256 kbps (High)</option>
                    <option value="192000" className="bg-black">192 kbps (Standard)</option>
                    <option value="128000" className="bg-black">128 kbps (Low)</option>
                    <option value="64000" className="bg-black">64 kbps (Very Low)</option>
                  </select>
                </div>
              </div>

              <div className="h-px bg-white/10 my-4" />

              {/* Toggle Switches for Overlay Items */}
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="font-mono text-sm">Units (MPH)</span>
                <input
                  type="checkbox"
                  checked={overlayConfig.useMph}
                  onChange={() => setOverlayConfig(prev => ({ ...prev, useMph: !prev.useMph }))}
                  className="sr-only"
                />
                <div className={`w-10 h-5 rounded-full transition-colors relative ${overlayConfig.useMph ? 'bg-indigo-500' : 'bg-white/10'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${overlayConfig.useMph ? 'left-6' : 'left-1'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="font-mono text-sm">Loop Mode (60s)</span>
                  <span className="text-[10px] opacity-50">Background RAM buffer</span>
                </div>
                <input
                  type="checkbox"
                  checked={overlayConfig.loopMode}
                  onChange={() => setOverlayConfig(prev => ({ ...prev, loopMode: !prev.loopMode }))}
                  className="sr-only"
                />
                <div className={`w-10 h-5 rounded-full transition-colors relative ${overlayConfig.loopMode ? 'bg-amber-500' : 'bg-white/10'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${overlayConfig.loopMode ? 'left-6' : 'left-1'}`} />
                </div>
              </label>
              <label className={`flex items-center justify-between cursor-pointer group ${!overlayConfig.loopMode ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
                <div className="flex flex-col">
                  <span className="font-mono text-sm">G-Sensor Detection</span>
                  <span className="text-[10px] opacity-50">
                    {!overlayConfig.loopMode ? 'Requires Loop Mode' : 'Auto-save on impact'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  disabled={!overlayConfig.loopMode}
                  checked={overlayConfig.gSensor && overlayConfig.loopMode}
                  onChange={() => setOverlayConfig(prev => ({ ...prev, gSensor: !prev.gSensor }))}
                  className="sr-only"
                />
                <div className={`w-10 h-5 rounded-full transition-colors relative ${overlayConfig.gSensor && overlayConfig.loopMode ? 'bg-red-500' : 'bg-white/10'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${overlayConfig.gSensor && overlayConfig.loopMode ? 'left-6' : 'left-1'}`} />
                </div>
              </label>

              {overlayConfig.gSensor && overlayConfig.loopMode && (
                <div className="space-y-2 pl-2 border-l border-red-500/30">
                  {typeof (DeviceMotionEvent as any).requestPermission === 'function' && (
                    <button
                      onClick={requestMotionPermission}
                      className="w-full py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg font-mono text-[10px] transition-all mb-2 border border-red-500/30"
                    >
                      ACTIVATE SENSORS (iOS)
                    </button>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] uppercase opacity-50">Sensitivity (Gs)</span>
                    <span className="font-mono text-xs text-red-400">{overlayConfig.gThreshold.toFixed(1)}G</span>
                  </div>
                  <input
                    type="range"
                    min="1.5"
                    max="10.0"
                    step="0.1"
                    value={overlayConfig.gThreshold}
                    onChange={(e) => setOverlayConfig(prev => ({ ...prev, gThreshold: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <div className="flex justify-between text-[8px] font-mono opacity-30">
                    <span>SENSITIVE (1.5G)</span>
                    <span>HEAVY (10.0G)</span>
                  </div>
                </div>
              )}

              <div className="h-px bg-white/10 my-2" />
              {Object.entries(overlayConfig).filter(([k]) => !['altitude', 'useMph', 'loopMode', 'gSensor', 'gThreshold', 'videoQuality', 'audioQuality', 'videoCodec', 'audioCodec', 'videoBitrate', 'audioBitrate', 'maxHeartRate', 'videoOrientation', 'videoFramerate', 'ftp', 'heartRate', 'power', 'speed', 'grade', 'gps', 'hrSmoothing', 'powerSmoothing', 'gpsSmoothing', 'hrCalibration', 'powerCalibration'].includes(k)).map(([key, value]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer group">
                  <span className="font-mono text-sm capitalize">{key}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={() => setOverlayConfig(prev => ({ ...prev, [key]: !value }))}
                    className="sr-only"
                  />
                  <div className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-emerald-500' : 'bg-white/10'}`}>
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${value ? 'left-6' : 'left-1'}`} />
                  </div>
                </label>
              ))}
              
              <div className="mt-6 pt-4 border-t border-white/10 flex flex-col items-center gap-1">
                <button
                  onClick={() => {
                    window.history.pushState({ menu: 'debug' }, '');
                    setShowDebugModal(true);
                  }}
                  className="w-full mb-4 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Terminal className="w-4 h-4" /> Open Debug Logs
                </button>
                <span className="text-[10px] font-mono opacity-30 uppercase tracking-widest">Cycling DashCam</span>
                <span className="text-[11px] font-mono text-emerald-500/70">v{APP_VERSION}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Modal */}
      {showDebugModal && <DebugModal onClose={() => window.history.back()} />}

      {/* Layer 5: Main UI Controls (Snapshot & Record) */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8 md:gap-12">
        {/* Snapshot Button */}
        <button
          onClick={takeSnapshot}
          className="w-16 h-16 bg-white/10 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center hover:bg-white/20 transition-all group"
          title="Take Snapshot"
        >
          <Camera className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
        </button>

        {/* Incident Button (Only in Loop Mode when active) */}
        {overlayConfig.loopMode && isLooping && (
          <button
            onClick={saveLoopIncident}
            className="w-16 h-16 bg-amber-500/20 backdrop-blur-md border border-amber-500/50 rounded-full flex items-center justify-center hover:bg-amber-500/40 transition-all group"
            title="Save Last 60s"
          >
            <Circle className="w-6 h-6 text-amber-500 fill-amber-500 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-8 text-[10px] font-mono text-amber-500 font-bold bg-black/50 px-2 py-0.5 rounded">INCIDENT</span>
          </button>
        )}

        {/* Record Button (Toggles between Start/Stop) */}
        {!(overlayConfig.loopMode ? isLooping : isRecording) ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (overlayConfig.loopMode) {
                startLoopRecording();
              } else {
                startRecording();
              }
            }}
            className={`w-24 h-24 bg-white/10 backdrop-blur-md border-4 ${overlayConfig.loopMode ? 'border-amber-500' : 'border-white'} rounded-full flex items-center justify-center hover:bg-white/20 transition-all group shadow-2xl`}
            title={overlayConfig.loopMode ? "Start Loop Mode" : "Start Recording"}
          >
            <div className={`w-16 h-16 ${overlayConfig.loopMode ? 'bg-amber-500' : 'bg-red-600'} rounded-full group-hover:scale-95 transition-transform shadow-inner`} />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (overlayConfig.loopMode) {
                stopLoopRecording();
              } else {
                stopRecording();
              }
            }}
            className={`w-24 h-24 bg-white/10 backdrop-blur-md border-4 ${overlayConfig.loopMode ? 'border-amber-500' : 'border-red-500'} rounded-full flex items-center justify-center hover:bg-white/20 transition-all animate-pulse shadow-2xl`}
            title={overlayConfig.loopMode ? "Stop Loop Mode" : "Stop Recording"}
          >
            <Square className={`w-10 h-10 ${overlayConfig.loopMode ? 'text-amber-500 fill-amber-500' : 'text-red-500 fill-red-500'}`} />
          </button>
        )}

        {/* Camera Toggle Button */}
        <button
          onClick={toggleCamera}
          className="w-16 h-16 bg-white/10 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center hover:bg-white/20 transition-all group"
          title="Switch Camera"
        >
          <RefreshCw className="w-6 h-6 text-white group-hover:rotate-180 transition-transform duration-500" />
        </button>
      </div>

      {/* Layer 6: Camera Access Overlay (Shows if permission is pending or denied) */}
      {!hasCamera && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-50">
          <Camera className="w-16 h-16 mb-4 opacity-50" />
          <p className="font-mono text-lg">Waiting for camera access...</p>
        </div>
      )}

      {/* Layer 7: Recording Indicator (Floating badge) */}
      {(isRecording || isLooping) && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className={`${isLooping ? 'bg-amber-500' : 'bg-red-500'} text-white font-mono px-4 py-1.5 rounded-full text-sm font-bold tracking-widest uppercase flex items-center gap-2 shadow-lg animate-pulse`}>
            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
            {isLooping ? 'LOOP' : `REC ${formatDuration(elapsedTime)}`}
          </div>
        </div>
      )}
    </div>
  );
}
