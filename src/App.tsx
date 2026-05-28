/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Trash2, Music, Volume2, Info, Sliders, Activity, Zap, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Constants
const CHANNEL_COUNT = 4;
const KEY_COUNT = 48; // 4 octaves
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function App() {
  const [activeChannel, setActiveChannel] = useState(0);
  const [isRecording, setIsRecording] = useState<boolean[]>([false, false, false, false]);
  const [isRecordingPaused, setIsRecordingPaused] = useState<boolean[]>([false, false, false, false]);
  const [audioBuffers, setAudioBuffers] = useState<(AudioBuffer | null)[]>([null, null, null, null]);
  const [recordingTimes, setRecordingTimes] = useState<number[]>([0, 0, 0, 0]);
  const [channelNames, setChannelNames] = useState<string[]>(['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4']);
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());
  const [showInfo, setShowInfo] = useState(false);
  const [showFX, setShowFX] = useState(true);

  // FX States (Arrays for 4 channels)
  const [pitches, setPitches] = useState<number[]>([1, 1, 1, 1]);
  const [reverbMixes, setReverbMixes] = useState<number[]>([0.3, 0.3, 0.3, 0.3]);
  const [delayTimes, setDelayTimes] = useState<number[]>([0.3, 0.3, 0.3, 0.3]);
  const [delayFeedbacks, setDelayFeedbacks] = useState<number[]>([0.4, 0.4, 0.4, 0.4]);
  
  const [midiStatus, setMidiStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
  const [midiInputs, setMidiInputs] = useState<string[]>([]);
  const [lastMidiNote, setLastMidiNote] = useState<number | null>(null);
  const midiAccessRef = useRef<any>(null);
  const [isPerformanceRecording, setIsPerformanceRecording] = useState(false);
  const [stems, setStems] = useState<{ id: string; blob: Blob; timestamp: number; settings: any }[]>([]);
  const [performanceTime, setPerformanceTime] = useState(0);
  const isSessionActiveRef = useRef(false);
  const hasPlayedNotesRef = useRef(false);
  const currentStemSettingsRef = useRef({ pitches: [1, 1, 1, 1], reverbMixes: [0.3, 0.3, 0.3, 0.3] });
  const latestSettingsRef = useRef({ pitches: [1, 1, 1, 1], reverbMixes: [0.3, 0.3, 0.3, 0.3], delayTimes: [0.3, 0.3, 0.3, 0.3], delayFeedbacks: [0.4, 0.4, 0.4, 0.4] });
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [inputLevel, setInputLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const performanceRecorderRef = useRef<MediaRecorder | null>(null);
  const fullSessionRecorderRef = useRef<MediaRecorder | null>(null);
  const fullSessionChunksRef = useRef<Blob[]>([]);
  const [fullSessionBlob, setFullSessionBlob] = useState<Blob | null>(null);
  const performanceChunksRef = useRef<Blob[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const performanceTimerRef = useRef<number | null>(null);
  const sourceNodesRef = useRef<{ [key: string]: AudioBufferSourceNode }>({}); // Keyed by channelIndex-noteIndex
  
  // FX Nodes (Arrays for 4 sets)
  const reverbNodeRef = useRef<(ConvolverNode | null)[]>([null, null, null, null]);
  const reverbGainRef = useRef<(GainNode | null)[]>([null, null, null, null]);
  const delayNodeRef = useRef<(DelayNode | null)[]>([null, null, null, null]);
  const delayFeedbackRef = useRef<(GainNode | null)[]>([null, null, null, null]);
  const dryGainRef = useRef<(GainNode | null)[]>([null, null, null, null]);
  const mainOutRef = useRef<GainNode | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const playSliceRef = useRef<((index: number) => void) | null>(null);

  // Keyboard Mapping
  const KEYBOARD_MAP: Record<string, number> = {
    // Letters on White Keys (A-Z spread across 4 octaves)
    'a': 0, 'b': 2, 'c': 4, 'd': 5, 'e': 7, 'f': 9, 'g': 11,
    'h': 12, 'i': 14, 'j': 16, 'k': 17, 'l': 19, 'm': 21, 'n': 23,
    'o': 24, 'p': 26, 'q': 28, 'r': 29, 's': 31, 't': 33, 'u': 35,
    'v': 36, 'w': 38, 'x': 40, 'y': 41, 'z': 43,
    // Uppercase support
    'A': 0, 'B': 2, 'C': 4, 'D': 5, 'E': 7, 'F': 9, 'G': 11,
    'H': 12, 'I': 14, 'J': 16, 'K': 17, 'L': 19, 'M': 21, 'N': 23,
    'O': 24, 'P': 26, 'Q': 28, 'R': 29, 'S': 31, 'T': 33, 'U': 35,
    'V': 36, 'W': 38, 'X': 40, 'Y': 41, 'Z': 43,

    // Numbers and Symbols on Black Keys
    '1': 1, '2': 3, '3': 6, '4': 8, '5': 10,
    '6': 13, '7': 15, '8': 18, '9': 20, '0': 22,
    ',': 25, '.': 27, ';': 30, "'": 32, '/': 34,
    '[': 37, ']': 39, '-': 42, '=': 44, '\\': 46
  };

  const KEYBOARD_LABELS: Record<number, string> = {
    // White Keys
    0: 'A', 2: 'B', 4: 'C', 5: 'D', 7: 'E', 9: 'F', 11: 'G',
    12: 'H', 14: 'I', 16: 'J', 17: 'K', 19: 'L', 21: 'M', 23: 'N',
    24: 'O', 26: 'P', 28: 'Q', 29: 'R', 31: 'S', 33: 'T', 35: 'U',
    36: 'V', 38: 'W', 40: 'X', 41: 'Y', 43: 'Z',
    // Black Keys
    1: '1', 3: '2', 6: '3', 8: '4', 10: '5',
    13: '6', 15: '7', 18: '8', 20: '9', 22: '0',
    25: ',', 27: '.', 30: ';', 32: "'", 34: '/',
    37: '[', 39: ']', 42: '-', 44: '=', 46: '\\'
  };

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input (though we don't have any yet)
      if (e.repeat) return; 
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      if (KEYBOARD_MAP[key] !== undefined) {
        playSliceRef.current?.(KEYBOARD_MAP[key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize Audio Context & FX Chains for each channel
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;

    // Main Output
    const mainOut = ctx.createGain();
    mainOut.gain.value = masterVolume;
    mainOut.connect(ctx.destination);
    mainOutRef.current = mainOut;

    // Destination for Recording
    const dest = ctx.createMediaStreamDestination();
    mainOut.connect(dest);
    destNodeRef.current = dest;

    // Set up 4 independent FX chains
    for (let i = 0; i < CHANNEL_COUNT; i++) {
        // Dry Path
        const dryGain = ctx.createGain();
        dryGain.connect(mainOut);
        dryGainRef.current[i] = dryGain;

        // Delay Path
        const delay = ctx.createDelay(2.0);
        const feedback = ctx.createGain();
        delay.delayTime.value = delayTimes[i];
        feedback.gain.value = delayFeedbacks[i];
        
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(mainOut);
        
        delayNodeRef.current[i] = delay;
        delayFeedbackRef.current[i] = feedback;

        // Reverb Path
        const reverb = ctx.createConvolver();
        const reverbGain = ctx.createGain();
        reverbGain.gain.value = reverbMixes[i];
        
        // Generate simple impulse response for reverb
        const length = ctx.sampleRate * 2;
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const channel = impulse.getChannelData(ch);
          for (let j = 0; j < length; j++) {
            channel[j] = (Math.random() * 2 - 1) * Math.exp(-j / (ctx.sampleRate * 0.5));
          }
        }
        reverb.buffer = impulse;
        
        reverb.connect(reverbGain);
        reverbGain.connect(mainOut);

        reverbNodeRef.current[i] = reverb;
        reverbGainRef.current[i] = reverbGain;
    }

    return () => {
      ctx.close();
    };
  }, []);

  // Update FX Parameters for all channels
  useEffect(() => {
    // Keep latest settings ref up to date
    latestSettingsRef.current = { pitches, reverbMixes, delayTimes, delayFeedbacks };

    if (audioContextRef.current) {
        if (mainOutRef.current) mainOutRef.current.gain.setTargetAtTime(masterVolume, audioContextRef.current.currentTime, 0.1);
        
        for (let i = 0; i < CHANNEL_COUNT; i++) {
            const reverbGain = reverbGainRef.current[i];
            const delayNode = delayNodeRef.current[i];
            const delayFeedback = delayFeedbackRef.current[i];
            
            if (reverbGain) reverbGain.gain.setTargetAtTime(reverbMixes[i], audioContextRef.current.currentTime, 0.1);
            if (delayNode) delayNode.delayTime.setTargetAtTime(delayTimes[i], audioContextRef.current.currentTime, 0.1);
            if (delayFeedback) delayFeedback.gain.setTargetAtTime(delayFeedbacks[i], audioContextRef.current.currentTime, 0.1);
        }
    }

    // If we are in "Session Mode" and have played notes, 
    // changing settings should trigger a stem save
    if (isSessionActiveRef.current && hasPlayedNotesRef.current) {
      if (performanceRecorderRef.current && performanceRecorderRef.current.state === 'recording') {
        performanceRecorderRef.current.stop();
      }
    }
  }, [masterVolume, reverbMixes, delayTimes, delayFeedbacks, pitches]);


  const updateBufferFromChunks = useCallback(async () => {
    if (chunksRef.current.length === 0 || !audioContextRef.current) return;
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' });
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffers(prev => {
        const next = [...prev];
        next[activeChannel] = buffer;
        return next;
      });
    } catch (err) {
      console.error('Error decoding intermediate audio:', err);
    }
  }, [activeChannel]);

  // Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Setup Analyser for Level Meter
      if (audioContextRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          setInputLevel(average / 128); // Normalize roughly
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          if (mediaRecorder.state === 'paused') {
            updateBufferFromChunks();
          }
        }
      };

      mediaRecorder.onstop = async () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        analyserRef.current = null;
        setInputLevel(0);

        const blob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' });
        const arrayBuffer = await blob.arrayBuffer();
        if (audioContextRef.current) {
          const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          setAudioBuffers(prev => {
            const next = [...prev];
            next[activeChannel] = buffer;
            return next;
          });
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(prev => {
        const next = [...prev];
        next[activeChannel] = true;
        return next;
      });
      setIsRecordingPaused(prev => {
        const next = [...prev];
        next[activeChannel] = false;
        return next;
      });
      setRecordingTimes(prev => {
        const next = [...prev];
        next[activeChannel] = 0;
        return next;
      });
      timerRef.current = window.setInterval(() => {
        setRecordingTimes(prev => {
          const next = [...prev];
          next[activeChannel] = next[activeChannel] + 1;
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording[activeChannel] && !isRecordingPaused[activeChannel]) {
      mediaRecorderRef.current.pause();
      mediaRecorderRef.current.requestData();
      setIsRecordingPaused(prev => {
        const next = [...prev];
        next[activeChannel] = true;
        return next;
      });
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording[activeChannel] && isRecordingPaused[activeChannel]) {
      mediaRecorderRef.current.resume();
      setIsRecordingPaused(prev => {
        const next = [...prev];
        next[activeChannel] = false;
        return next;
      });
      timerRef.current = window.setInterval(() => {
        setRecordingTimes(prev => {
          const next = [...prev];
          next[activeChannel] = next[activeChannel] + 1;
          return next;
        });
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording[activeChannel]) {
      mediaRecorderRef.current.stop();
      setIsRecording(prev => {
        const next = [...prev];
        next[activeChannel] = false;
        return next;
      });
      setIsRecordingPaused(prev => {
        const next = [...prev];
        next[activeChannel] = false;
        return next;
      });
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !audioContextRef.current) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffers(prev => {
        const next = [...prev];
        next[activeChannel] = buffer;
        return next;
      });
      setRecordingTimes(prev => {
        const next = [...prev];
        next[activeChannel] = 0;
        return next;
      });
    } catch (err) {
      console.error('Error decoding audio file:', err);
      alert('Could not decode audio file. Please try a different format.');
    }
  };

  const clearRecording = () => {
    setAudioBuffers(prev => {
      const next = [...prev];
      next[activeChannel] = null;
      return next;
    });
    setRecordingTimes(prev => {
      const next = [...prev];
      next[activeChannel] = 0;
      return next;
    });
  };


  // Performance Recording Logic
  const startPerformanceRecording = () => {
    if (!destNodeRef.current) return;
    
    // Stem Recorder
    const recorder = new MediaRecorder(destNodeRef.current.stream);
    performanceRecorderRef.current = recorder;
    performanceChunksRef.current = [];
    setPerformanceTime(0);
    setFullSessionBlob(null);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) performanceChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      // Save the stem if notes were played
      if (performanceChunksRef.current.length > 0 && hasPlayedNotesRef.current) {
        const blob = new Blob(performanceChunksRef.current, { type: 'audio/wav' });
        const newStem = {
          id: Math.random().toString(36).substr(2, 9),
          blob,
          timestamp: Date.now(),
          settings: { 
            pitches: [...currentStemSettingsRef.current.pitches], 
            reverbMixes: [...currentStemSettingsRef.current.reverbMixes] 
          }
        };
        setStems(prev => [newStem, ...prev]);
      }
      
      // Reset for next segment
      hasPlayedNotesRef.current = false;
      performanceChunksRef.current = [];
      
      // Prepare for next take with the NEW settings that just triggered the stop
      currentStemSettingsRef.current = { 
        pitches: [...latestSettingsRef.current.pitches], 
        reverbMixes: [...latestSettingsRef.current.reverbMixes] 
      };

      // Restart if session is still active
      if (isSessionActiveRef.current && performanceRecorderRef.current) {
        try {
          performanceRecorderRef.current.start();
        } catch (e) {
          console.error("Failed to restart recorder:", e);
        }
      }
    };

    // Full Session Recorder
    const fullRecorder = new MediaRecorder(destNodeRef.current.stream);
    fullSessionRecorderRef.current = fullRecorder;
    fullSessionChunksRef.current = [];
    fullRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) fullSessionChunksRef.current.push(e.data);
    };
    fullRecorder.onstop = () => {
      const blob = new Blob(fullSessionChunksRef.current, { type: 'audio/wav' });
      setFullSessionBlob(blob);
    };

    recorder.start();
    fullRecorder.start();
    isSessionActiveRef.current = true;
    setIsPerformanceRecording(true);
    hasPlayedNotesRef.current = false;
    currentStemSettingsRef.current = { pitches: [...pitches], reverbMixes: [...reverbMixes] };
    
    performanceTimerRef.current = window.setInterval(() => {
      setPerformanceTime(prev => prev + 1);
    }, 1000);
  };

  const stopPerformanceRecording = () => {
    isSessionActiveRef.current = false;
    if (performanceRecorderRef.current && performanceRecorderRef.current.state === 'recording') {
      performanceRecorderRef.current.stop();
    }
    if (fullSessionRecorderRef.current && fullSessionRecorderRef.current.state === 'recording') {
      fullSessionRecorderRef.current.stop();
    }
    setIsPerformanceRecording(false);
    if (performanceTimerRef.current) clearInterval(performanceTimerRef.current);
  };

  const downloadStem = (stem: any) => {
    const url = URL.createObjectURL(stem.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonic-slice-stem-${new Date(stem.timestamp).toISOString().replace(/[:.]/g, '-')}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteStem = (id: string) => {
    setStems(prev => prev.filter(s => s.id !== id));
  };

  const clearAllStems = () => {
    setStems([]);
  };

  const downloadAllStems = () => {
    stems.forEach((stem, index) => {
      setTimeout(() => downloadStem(stem), index * 300);
    });
  };

  const downloadFullSession = () => {
    if (!fullSessionBlob) return;
    const url = URL.createObjectURL(fullSessionBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonic-slice-full-track-${new Date().getTime()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Playback Logic for targeted channel
  const playSlice = useCallback((noteIndex: number, channelIndex: number = activeChannel) => {
    const buffer = audioBuffers[channelIndex];
    if (!buffer || !audioContextRef.current) return;

    // Source key to prevent overlap on same channel-note
    const sourceKey = `${channelIndex}-${noteIndex}`;

    // Stop existing node for this key if it exists
    if (sourceNodesRef.current[sourceKey]) {
      try {
        sourceNodesRef.current[sourceKey].stop();
      } catch (e) {}
    }

    const duration = buffer.duration;
    const sliceDuration = duration / KEY_COUNT;
    const startTime = noteIndex * sliceDuration;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitches[channelIndex];
    
    // Connect to specific FX chain for this channel
    source.connect(dryGainRef.current[channelIndex]!);
    source.connect(delayNodeRef.current[channelIndex]!);
    source.connect(reverbNodeRef.current[channelIndex]!);
    
    // Play only the slice (adjusted for pitch)
    source.start(0, startTime, sliceDuration);
    sourceNodesRef.current[sourceKey] = source;
    hasPlayedNotesRef.current = true;
    
    if (channelIndex === activeChannel) {
        setActiveKeys(prev => {
          const next = new Set(prev);
          next.add(noteIndex);
          return next;
        });
    }

    source.onended = () => {
      if (channelIndex === activeChannel) {
          setActiveKeys(prev => {
            const next = new Set(prev);
            next.delete(noteIndex);
            return next;
          });
      }
      delete sourceNodesRef.current[sourceKey];
    };
  }, [audioBuffers, pitches, activeChannel]);

  // MIDI Support
  useEffect(() => {
    playSliceRef.current = playSlice;
  }, [playSlice]);

  const requestMidi = () => {
    const handleMIDIMessage = (message: any) => {
      const [status, note, velocity] = message.data;
      const type = status & 0xf0;
      
      // Resume context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }

      if (type === 144 && velocity > 0) { // Note On
        setLastMidiNote(note);
        setTimeout(() => setLastMidiNote(null), 150);

        // Map MIDI note to our keys (starting from C3 = 48)
        const keyIndex = note - 48;
        if (keyIndex >= 0 && keyIndex < KEY_COUNT) {
          playSliceRef.current?.(keyIndex);
        }
      }
    };

    const setupInputs = (access: any) => {
      const inputs = access.inputs.values();
      const inputNames: string[] = [];
      for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
        input.value.onmidimessage = handleMIDIMessage;
        inputNames.push(input.value.name || 'Unknown Device');
      }
      setMidiInputs(inputNames);
    };

    const onMIDISuccess = (access: any) => {
      midiAccessRef.current = access;
      setMidiStatus('connected');
      setupInputs(access);
      
      access.onstatechange = (e: any) => {
        console.log('MIDI State Change:', e.port.name, e.port.state);
        setupInputs(access);
      };
    };

    const onMIDIFailure = () => {
      console.warn('MIDI Access Failed');
      setMidiStatus('error');
    };

    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
    } else {
      setMidiStatus('error');
    }
  };

  useEffect(() => {
    requestMidi();
    return () => {
      if (midiAccessRef.current) {
        const inputs = midiAccessRef.current.inputs.values();
        for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
          input.value.onmidimessage = null;
        }
        midiAccessRef.current.onstatechange = null;
      }
    };
  }, []); // Only run once on mount

  const stopSlice = useCallback((index: number) => {
    // Optional: stop on release
  }, []);

  // Keyboard mapping for UI
  const keys = Array.from({ length: KEY_COUNT }, (_, i) => {
    const noteIndex = i % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);
    return { 
      index: i, 
      isBlack, 
      label: NOTES[noteIndex],
      kbLabel: KEYBOARD_LABELS[i] || null
    };
  });

  return (
    <div className="min-h-screen bg-[#0D0E10] text-[#FFFFFF] font-sans selection:bg-[#FF4444]/30">
      {/* Header */}
      <header className="p-4 border-b border-white/5 flex flex-col md:flex-row justify-between items-center bg-[#151619]/80 backdrop-blur-md sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FF4444] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(255,68,68,0.3)]">
            <Music className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">SONIC SLICE <span className="text-[#FF4444] text-[10px] ml-1">PRO</span></h1>
            <div className="flex items-center gap-2">
              <p className="text-[8px] font-mono text-white/40 uppercase tracking-[0.2em]">4-Channel Studio v2.5</p>
              <div className={`w-1.5 h-1.5 rounded-full transition-all duration-75 ${midiStatus === 'connected' ? (lastMidiNote ? 'bg-[#FF4444] scale-150 shadow-[0_0_10px_rgba(255,68,68,0.8)]' : 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]') : 'bg-white/10'}`} />
            </div>
          </div>
        </div>

        {/* Channel Selector */}
        <div className="flex bg-black/40 rounded-xl p-1 gap-1 border border-white/5">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="flex items-center">
              {editingChannel === idx ? (
                <input
                  autoFocus
                  className="bg-white/10 text-white text-[10px] font-bold uppercase rounded px-2 py-1.5 outline-none border border-[#FF4444]/50 w-24"
                  value={channelNames[idx]}
                  onChange={(e) => {
                    const newNames = [...channelNames];
                    newNames[idx] = e.target.value;
                    setChannelNames(newNames);
                  }}
                  onBlur={() => setEditingChannel(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingChannel(null);
                  }}
                />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveChannel(idx);
                    setActiveKeys(new Set()); // Reset visual keys on switch
                  }}
                  onDoubleClick={() => setEditingChannel(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveChannel(idx);
                      setActiveKeys(new Set());
                    }
                  }}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-2 group cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#FF4444] ${
                    activeChannel === idx 
                      ? 'bg-[#FF4444] text-white shadow-lg' 
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}
                >
                  <span className="truncate max-w-[100px]">{channelNames[idx]}</span>
                  {audioBuffers[idx] && <div className={`w-1.5 h-1.5 rounded-full ${activeChannel === idx ? 'bg-white' : 'bg-emerald-500'}`} />}
                  {activeChannel === idx && (
                    <div 
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingChannel(idx);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          setEditingChannel(idx);
                        }
                      }}
                      className="ml-1 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity cursor-pointer p-0.5"
                    >
                      <Sliders className="w-3 h-3" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {audioBuffers.some(b => b !== null) && (
            <div className="flex items-center gap-2 mr-4 bg-white/5 p-1 rounded-xl border border-white/5">
              {isPerformanceRecording && (
                <div className="px-2 text-[10px] font-mono text-[#FF4444] border-r border-white/10 mr-1">
                  {Math.floor(performanceTime / 60)}:{(performanceTime % 60).toString().padStart(2, '0')}
                </div>
              )}
              {!isPerformanceRecording ? (
                <button
                  onClick={startPerformanceRecording}
                  className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-white/5 rounded-lg transition-all text-white/60 hover:text-white"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Start Session
                </button>
              ) : (
                <button
                  onClick={stopPerformanceRecording}
                  className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-[#FF4444] rounded-lg transition-all text-white animate-pulse"
                >
                  <Square className="w-2 h-2 fill-current" />
                  End Session
                </button>
              )}
            </div>
          )}
          <button 
            onClick={() => setShowFX(!showFX)}
            className={`p-2 rounded-lg transition-all ${showFX ? 'bg-[#FF4444] text-white' : 'hover:bg-white/5 text-white/60'}`}
          >
            <Sliders className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/60 hover:text-white"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Info Panel */}
        <AnimatePresence>
          {showInfo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-white/70 leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Activity className="w-3 h-3 text-[#FF4444]" />
                    How it works
                  </h3>
                  <p>
                    Capture any sound and instantly map it across {KEY_COUNT} keys. 
                    The recording is divided into equal segments from left to right.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-white/50">
                    <li>Left keys: Start of recording</li>
                    <li>Middle keys: Center portion</li>
                    <li>Right keys: End of recording</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Zap className="w-3 h-3 text-[#FF4444]" />
                    Pro Features
                  </h3>
                  <p>
                    Connect a MIDI keyboard to play slices using your hardware. 
                    Use the FX panel to shape your sound with Reverb, Delay, and Pitch control.
                  </p>
                  <p className="text-[10px] text-white/70">
                    <span className="text-[#FF4444] font-bold">NEW:</span> Play with your computer keyboard! Letters (A-Z) are on white keys, while numbers (0-9) and symbols are mapped to black keys.
                  </p>
                  <p className="text-[10px] text-white/40 italic">Note: MIDI mapping starts at C3 (Note 48).</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Column: Recording & Visualizer */}
          <div className="lg:col-span-3 space-y-4">
            <section className="flex flex-col items-center justify-center py-6 space-y-4 bg-[#151619] rounded-2xl border border-white/5 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                   style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              
              <div className="relative">
                <div className={`w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  isRecording[activeChannel] ? 'border-[#FF4444] shadow-[0_0_40px_rgba(255,68,68,0.2)]' : 'border-white/10'
                }`}>
                  <div className="text-center">
                    <div className="text-2xl font-mono font-light tracking-tighter mb-1">
                      {Math.floor(recordingTimes[activeChannel] / 60)}:{(recordingTimes[activeChannel] % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[8px] font-mono text-white/30 uppercase tracking-widest">
                      {isRecording[activeChannel] ? (isRecordingPaused[activeChannel] ? 'Paused' : 'Recording...') : audioBuffers[activeChannel] ? 'Sample Loaded' : 'Ready'}
                    </div>
                    <div className="text-[7px] text-[#FF4444] font-bold mt-1 uppercase">{channelNames[activeChannel]}</div>
                  </div>
                </div>
                {isRecording[activeChannel] && (
                  <motion.div 
                    animate={isRecordingPaused[activeChannel] ? { scale: 1, opacity: 0.2 } : { scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                    transition={isRecordingPaused[activeChannel] ? { duration: 0.5 } : { repeat: Infinity, duration: 2 }}
                    className={`absolute inset-0 rounded-full border-2 ${isRecordingPaused[activeChannel] ? 'border-yellow-500' : 'border-[#FF4444]'}`}
                  />
                )}
              </div>

              <div className="flex flex-col items-center gap-6 relative z-10 w-full max-w-md px-8">
                <div className="flex items-center gap-4 w-full">
                  {isRecording[activeChannel] ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-3 px-6 py-2.5 bg-[#FF4444] text-white rounded-full font-bold text-sm hover:bg-[#cc3333] transition-all active:scale-95 shadow-[0_0_20px_rgba(255,68,68,0.2)]"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Stop
                      </button>
                      
                      {!isRecordingPaused[activeChannel] ? (
                        <button
                          onClick={pauseRecording}
                          className="flex items-center gap-3 px-6 py-2.5 bg-white/5 text-white rounded-full font-bold text-sm hover:bg-white/10 transition-all active:scale-95 border border-white/10"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={resumeRecording}
                          className="flex items-center gap-3 px-6 py-2.5 bg-emerald-500 text-white rounded-full font-bold text-sm hover:bg-emerald-600 transition-all active:scale-95 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Resume
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={startRecording}
                        className="group flex items-center gap-3 px-6 py-2 bg-white text-black rounded-full font-bold text-sm hover:bg-[#FF4444] hover:text-white transition-all active:scale-95"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Record
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="group flex items-center gap-3 px-6 py-2 bg-white/5 text-white rounded-full font-bold text-sm hover:bg-white/10 transition-all active:scale-95 border border-white/10"
                      >
                        <Play className="w-3.5 h-3.5 rotate-90" />
                        Import
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept="audio/*" 
                        className="hidden" 
                      />
                    </div>
                  )}

                  {audioBuffers[activeChannel] && !isRecording[activeChannel] && (
                    <button
                      onClick={clearRecording}
                      className="p-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-full transition-all active:scale-95"
                      title="Clear Recording"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Volume Control */}
                  <div className="flex-1 flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/5">
                    <Volume2 className="w-3.5 h-3.5 text-white/40" />
                    <input 
                      type="range" min="0" max="1" step="0.01" value={masterVolume}
                      onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                      className="flex-1 accent-[#FF4444] bg-white/10 h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Level Meter */}
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 flex items-center">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-[#FF4444]"
                    animate={{ width: `${Math.min(inputLevel * 100, 100)}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
                  />
                </div>
              </div>
            </section>

            {audioBuffers[activeChannel] && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-12 bg-white/5 rounded-xl border border-white/5 flex items-end gap-[1px] p-2 overflow-hidden"
              >
                {Array.from({ length: 120 }).map((_, i) => {
                  const isHighlighted = Array.from(activeKeys).some((key: number) => 
                    Math.floor((key / KEY_COUNT) * 120) === i
                  );
                  return (
                    <div 
                      key={i}
                      className={`flex-1 rounded-t-sm transition-all duration-300 ${
                        isHighlighted 
                          ? 'bg-[#FF4444] h-full shadow-[0_0_10px_rgba(255,68,68,0.5)]' 
                          : 'bg-white/10 h-[20%]'
                      }`}
                    />
                  );
                })}
              </motion.div>
            )}

            {/* Keyboard Section moved inside grid column */}
            <section className="space-y-2">
              <div className="flex justify-between items-end px-2">
                <div className="flex items-center gap-2 text-white/40">
                  <Volume2 className="w-3 h-3" />
                  <span className="text-[9px] font-mono uppercase tracking-widest">Active: {channelNames[activeChannel]} | {midiStatus === 'connected' ? 'MIDI Active' : 'Ready'}</span>
                </div>
                <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">
                  {audioBuffers[activeChannel] ? `${audioBuffers[activeChannel]!.duration.toFixed(2)}s Sample` : 'No Sample'}
                </div>
              </div>

              <div className="relative h-48 bg-[#0a0a0b] rounded-2xl p-2 border border-white/5 shadow-inner flex gap-1 overflow-x-auto no-scrollbar">
                {keys.map((key) => (
                  <button
                    key={key.index}
                    onMouseDown={() => playSlice(key.index)}
                    className={`relative flex-1 min-w-[22px] rounded-b-lg transition-all duration-75 active:translate-y-1 ${
                      key.isBlack 
                        ? 'bg-[#1a1b1e] h-[60%] z-10 -mx-2.5 border-x border-b border-white/10 shadow-2xl' 
                        : 'bg-[#f0f0f0] h-full z-0 border-b-4 border-black/10'
                    } ${
                      activeKeys.has(key.index) 
                        ? (key.isBlack ? 'bg-[#FF4444] border-[#FF4444] shadow-[0_0_15px_rgba(255,68,68,0.4)]' : 'bg-[#FF4444] border-b-[#cc3333] shadow-[0_0_20px_rgba(255,68,68,0.3)]') 
                        : ''
                    }`}
                  >
                    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-2 gap-1 pointer-events-none">
                      {key.kbLabel && (
                        <span className={`text-[9px] font-bold font-mono px-1 rounded ${
                          key.isBlack 
                            ? (activeKeys.has(key.index) ? 'text-white' : 'text-[#FF4444] bg-white/5') 
                            : (activeKeys.has(key.index) ? 'text-white' : 'text-black bg-black/5')
                        }`}>
                          {key.kbLabel}
                        </span>
                      )}
                      {!key.isBlack && (
                        <span className={`text-[7px] font-mono font-bold uppercase tracking-tighter ${
                          activeKeys.has(key.index) ? 'text-white/60' : 'text-black/20'
                        }`}>
                          {key.label}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: FX Controls */}
          <AnimatePresence>
            {showFX && (
              <motion.aside 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 50, opacity: 0 }}
                className="bg-[#151619] rounded-2xl border border-white/5 p-4 space-y-6 shadow-2xl flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">Effects Rack</h2>
                  <Sliders className="w-3 h-3 text-[#FF4444]" />
                </div>

                <div className="flex justify-between items-stretch gap-4 h-64 px-2">
                  {/* Pitch */}
                  <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
                    <span className="text-[8px] font-mono text-[#FF4444] font-bold">{pitches[activeChannel].toFixed(2)}x</span>
                    <div className="flex-1 w-4 bg-white/5 rounded-full relative flex justify-center p-1 overflow-hidden">
                      <input 
                        type="range" min="0.5" max="2" step="0.01" value={pitches[activeChannel]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setPitches(prev => {
                            const next = [...prev];
                            next[activeChannel] = val;
                            return next;
                          });
                        }}
                        className="h-full cursor-pointer accent-[#FF4444]"
                        style={{ appearance: 'slider-vertical', width: '100%', WebkitAppearance: 'slider-vertical' }}
                      />
                    </div>
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-white/40 text-center leading-none">Pitch</span>
                  </div>

                  {/* Reverb */}
                  <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
                    <span className="text-[8px] font-mono text-[#FF4444] font-bold">{Math.round(reverbMixes[activeChannel] * 100)}%</span>
                    <div className="flex-1 w-4 bg-white/5 rounded-full relative flex justify-center p-1 overflow-hidden">
                      <input 
                        type="range" min="0" max="1" step="0.01" value={reverbMixes[activeChannel]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setReverbMixes(prev => {
                            const next = [...prev];
                            next[activeChannel] = val;
                            return next;
                          });
                        }}
                        className="h-full cursor-pointer accent-[#FF4444]"
                        style={{ appearance: 'slider-vertical', width: '100%', WebkitAppearance: 'slider-vertical' }}
                      />
                    </div>
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-white/40 text-center leading-none">Reverb</span>
                  </div>

                  {/* Delay Time */}
                  <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
                    <span className="text-[8px] font-mono text-[#FF4444] font-bold">{delayTimes[activeChannel].toFixed(2)}s</span>
                    <div className="flex-1 w-4 bg-white/5 rounded-full relative flex justify-center p-1 overflow-hidden">
                      <input 
                        type="range" min="0" max="2" step="0.01" value={delayTimes[activeChannel]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setDelayTimes(prev => {
                            const next = [...prev];
                            next[activeChannel] = val;
                            return next;
                          });
                        }}
                        className="h-full cursor-pointer accent-[#FF4444]"
                        style={{ appearance: 'slider-vertical', width: '100%', WebkitAppearance: 'slider-vertical' }}
                      />
                    </div>
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-white/40 text-center leading-none">Delay</span>
                  </div>

                  {/* Feedback */}
                  <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
                    <span className="text-[8px] font-mono text-[#FF4444] font-bold">{Math.round(delayFeedbacks[activeChannel] * 100)}%</span>
                    <div className="flex-1 w-4 bg-white/5 rounded-full relative flex justify-center p-1 overflow-hidden">
                      <input 
                        type="range" min="0" max="0.9" step="0.01" value={delayFeedbacks[activeChannel]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setDelayFeedbacks(prev => {
                            const next = [...prev];
                            next[activeChannel] = val;
                            return next;
                          });
                        }}
                        className="h-full cursor-pointer accent-[#FF4444]"
                        style={{ appearance: 'slider-vertical', width: '100%', WebkitAppearance: 'slider-vertical' }}
                      />
                    </div>
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-white/40 text-center leading-none">Fbck</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2 text-[8px] font-mono text-white/20 uppercase tracking-widest">
                    <Zap className="w-2.5 h-2.5" />
                    <span>DSP Active</span>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* Stems Library moved to bottom of main */}
        <aside className="bg-[#151619] rounded-2xl border border-white/5 p-4 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">Stems Library</h2>
              {stems.length > 0 && (
                <span className="bg-[#FF4444] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">{stems.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(stems.length > 0 || fullSessionBlob) && (
                <>
                  {fullSessionBlob && (
                    <button 
                      onClick={downloadFullSession}
                      className="text-[9px] font-mono uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      Download Full Track
                    </button>
                  )}
                  {stems.length > 0 && (
                    <>
                      {fullSessionBlob && <span className="text-white/10">|</span>}
                      <button 
                        onClick={downloadAllStems}
                        className="text-[9px] font-mono uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        Download All Stems
                      </button>
                    </>
                  )}
                  <span className="text-white/10">|</span>
                  <button 
                    onClick={clearAllStems}
                    className="text-[9px] font-mono uppercase tracking-widest text-white/20 hover:text-[#FF4444] transition-colors"
                  >
                    Clear All
                  </button>
                </>
              )}
              <Music className="w-3 h-3 text-[#FF4444] ml-2" />
            </div>
          </div>
          
          {stems.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-xl">
              <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">No stems recorded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {stems.map((stem) => (
                <motion.div 
                  key={stem.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3 group hover:border-[#FF4444]/30 transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[10px] font-bold text-white/90">STEM_{stem.id.toUpperCase()}</div>
                      <div className="text-[8px] font-mono text-white/30">{new Date(stem.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <button 
                      onClick={() => deleteStem(stem.id)}
                      className="p-1.5 hover:bg-[#FF4444]/10 text-white/20 hover:text-[#FF4444] rounded-md transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1 text-[7px] font-mono uppercase text-white/40">
                    <div className="bg-black/20 p-1 rounded">P: {stem.settings.pitches[0].toFixed(2)}x</div>
                    <div className="bg-black/20 p-1 rounded">R: {Math.round(stem.settings.reverbMixes[0] * 100)}%</div>
                    <div className="bg-black/20 p-1 rounded">CH: MULTI</div>
                  </div>

                  <button
                    onClick={() => downloadStem(stem)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-[#FF4444] text-white text-[9px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#cc3333] transition-all"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    Download Stem
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </aside>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center border-t border-white/5 mt-6 bg-[#0a0a0b]">
        <p className="text-[9px] font-mono text-white/10 uppercase tracking-[0.5em]">
          Sonic Slice Pro &bull; Experimental Audio Engine &bull; 2026
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type=range]::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          background: #FF4444;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255,68,68,0.5);
          transition: all 0.2s;
        }
        input[type=range]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 15px rgba(255,68,68,0.8);
        }
      `}} />
    </div>
  );
}
