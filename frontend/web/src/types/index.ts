import { z } from 'zod';

// Authentication types
export interface User {
  id: string;
  username: string;
  email: string;
  isAuthenticated: boolean;
}

// WebRTC connection types
export interface RTCConnectionConfig {
  iceServers: RTCIceServer[];
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// Audio processing types
export interface AudioConfig {
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

// Redis messaging types
export interface RedisMessage {
  id: string;
  timestamp: number;
  type: MessageType;
  payload: any;
}

export enum MessageType {
  TEXT = 'text',
  AUDIO_START = 'audio_start',
  AUDIO_CHUNK = 'audio_chunk',
  AUDIO_END = 'audio_end',
  RESPONSE_START = 'response_start',
  RESPONSE_CHUNK = 'response_chunk',
  RESPONSE_END = 'response_end',
  ERROR = 'error',
}

// Validation schemas using Zod
export const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3),
  email: z.string().email(),
  isAuthenticated: z.boolean(),
});

export const AudioConfigSchema = z.object({
  sampleRate: z.number().int().positive(),
  channelCount: z.number().int().min(1).max(2),
  echoCancellation: z.boolean(),
  noiseSuppression: z.boolean(),
  autoGainControl: z.boolean(),
});

export const RedisMessageSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.number().int().positive(),
  type: z.enum([
    MessageType.TEXT,
    MessageType.AUDIO_START,
    MessageType.AUDIO_CHUNK,
    MessageType.AUDIO_END,
    MessageType.RESPONSE_START,
    MessageType.RESPONSE_CHUNK,
    MessageType.RESPONSE_END,
    MessageType.ERROR,
  ]),
  payload: z.any(),
});

// Voice assistant types
export interface VoiceAssistantState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  error: string | null;
  lastQuery: string | null;
  lastResponse: string | null;
}

export type VoiceAssistantAction = 
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'START_PROCESSING' }
  | { type: 'STOP_PROCESSING' }
  | { type: 'START_SPEAKING' }
  | { type: 'STOP_SPEAKING' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'SET_RESPONSE'; payload: string }
  | { type: 'RESET' }; 