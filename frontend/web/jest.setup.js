// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock the MediaDevices API for WebRTC testing
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'MediaStream', {
    writable: true,
    value: jest.fn().mockImplementation((tracks) => ({
      getTracks: () => tracks || [],
      getAudioTracks: () => tracks?.filter(track => track.kind === 'audio') || [],
      getVideoTracks: () => tracks?.filter(track => track.kind === 'video') || [],
      addTrack: jest.fn(),
      removeTrack: jest.fn(),
    })),
  });

  Object.defineProperty(window.navigator, 'mediaDevices', {
    writable: true,
    value: {
      getUserMedia: jest.fn().mockImplementation(() => 
        Promise.resolve(new window.MediaStream())
      ),
      enumerateDevices: jest.fn().mockImplementation(() => 
        Promise.resolve([])
      ),
    },
  });
}