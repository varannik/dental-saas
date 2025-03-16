import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { WebRTCService } from '@/lib/webrtc/WebRTCService';

// Mock the WebRTCService
jest.mock('@/lib/webrtc/WebRTCService', () => {
  return {
    WebRTCService: jest.fn().mockImplementation(() => {
      return {
        initialize: jest.fn().mockResolvedValue(undefined),
        startRecording: jest.fn(),
        stopRecording: jest.fn(),
        dispose: jest.fn(),
        onAudioData: jest.fn(),
        onError: jest.fn(),
        getSessionId: jest.fn().mockReturnValue('mock-session-id'),
      };
    }),
  };
});

describe('useVoiceRecording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize WebRTCService on mount', async () => {
    const { result, rerender } = renderHook(() => useVoiceRecording());
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    expect(WebRTCService).toHaveBeenCalled();
    expect(result.current.isInitialized).toBe(true);
    expect(result.current.sessionId).toBe('mock-session-id');
  });

  it('should start and stop recording', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    expect(result.current.isRecording).toBe(false);
    
    // Start recording
    await act(async () => {
      result.current.startRecording();
    });
    
    expect(result.current.isRecording).toBe(true);
    
    // Verify WebRTCService.startRecording was called
    const mockWebRTCService = (WebRTCService as jest.Mock).mock.results[0].value;
    expect(mockWebRTCService.startRecording).toHaveBeenCalled();
    
    // Stop recording
    await act(async () => {
      result.current.stopRecording();
    });
    
    expect(result.current.isRecording).toBe(false);
    expect(mockWebRTCService.stopRecording).toHaveBeenCalled();
  });

  it('should toggle recording state', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Initial state is not recording
    expect(result.current.isRecording).toBe(false);
    
    // Toggle recording (start)
    await act(async () => {
      result.current.toggleRecording();
    });
    
    expect(result.current.isRecording).toBe(true);
    
    // Toggle recording (stop)
    await act(async () => {
      result.current.toggleRecording();
    });
    
    expect(result.current.isRecording).toBe(false);
  });

  it('should call onAudioData callback when audio data is received', async () => {
    const onAudioData = jest.fn();
    const { result } = renderHook(() => useVoiceRecording({ onAudioData }));
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Get the mock WebRTCService instance
    const mockWebRTCService = (WebRTCService as jest.Mock).mock.results[0].value;
    
    // Verify onAudioData callback was registered
    expect(mockWebRTCService.onAudioData).toHaveBeenCalled();
    
    // Call the registered callback with mock audio data
    const registeredCallback = mockWebRTCService.onAudioData.mock.calls[0][0];
    const mockBlob = new Blob(['test-audio-data'], { type: 'audio/webm' });
    registeredCallback(mockBlob);
    
    // Verify our callback was called with the data
    expect(onAudioData).toHaveBeenCalledWith(mockBlob);
  });

  it('should clean up on unmount', async () => {
    const { result, unmount } = renderHook(() => useVoiceRecording());
    
    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Get the mock WebRTCService instance
    const mockWebRTCService = (WebRTCService as jest.Mock).mock.results[0].value;
    
    // Unmount the hook
    unmount();
    
    // Verify dispose was called
    expect(mockWebRTCService.dispose).toHaveBeenCalled();
  });
}); 