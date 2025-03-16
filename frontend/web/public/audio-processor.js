/**
 * Audio Processor Worklet
 * 
 * This AudioWorkletProcessor handles audio processing for the voice assistant.
 * It performs basic audio processing including volume normalization and silence detection.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.silenceThreshold = 0.01; // Threshold for detecting silence
    this.silenceFrames = 0;
    this.isSilent = true;
    this.volumeNormalizationFactor = 1.0;
    this.processedSamples = 0;
  }

  /**
   * Process audio data
   * @param {Array} inputs - Array of inputs, each containing an array of channels
   * @param {Array} outputs - Array of outputs, each containing an array of channels
   * @param {Object} parameters - Parameters passed to the processor
   * @returns {boolean} - Whether to continue processing
   */
  process(inputs, outputs, parameters) {
    // Get the first input
    const input = inputs[0];
    
    // If there's no input, return true to keep the processor alive
    if (!input || !input.length) {
      return true;
    }
    
    // Get the first channel of the first input
    const channel = input[0];
    
    // If there's no channel data, return true to keep the processor alive
    if (!channel || !channel.length) {
      return true;
    }
    
    // Calculate RMS (Root Mean Square) to get volume level
    let sumSquares = 0;
    for (let i = 0; i < channel.length; i++) {
      sumSquares += channel[i] * channel[i];
    }
    const rms = Math.sqrt(sumSquares / channel.length);
    
    // Check for silence
    if (rms < this.silenceThreshold) {
      this.silenceFrames++;
      
      // If silence persists for more than 30 frames (about 600ms at 48kHz)
      if (this.silenceFrames > 30 && !this.isSilent) {
        this.isSilent = true;
        this.port.postMessage({ type: 'silence_detected' });
      }
    } else {
      this.silenceFrames = 0;
      
      if (this.isSilent) {
        this.isSilent = false;
        this.port.postMessage({ type: 'audio_detected' });
      }
      
      // Adaptive volume normalization - adjust based on observed levels
      if (rms > 0) {
        const targetRms = 0.2; // Target RMS level
        const adaptationRate = 0.01; // Rate at which normalization adapts
        
        // Gradually adjust normalization factor
        this.volumeNormalizationFactor = this.volumeNormalizationFactor * (1 - adaptationRate) +
            (targetRms / rms) * adaptationRate;
            
        // Limit the factor to avoid excessive amplification
        this.volumeNormalizationFactor = Math.min(5.0, this.volumeNormalizationFactor);
      }
    }
    
    // Process and normalize the output
    const output = outputs[0][0];
    if (output && output.length === channel.length) {
      for (let i = 0; i < channel.length; i++) {
        // Apply volume normalization
        output[i] = Math.min(1.0, Math.max(-1.0, channel[i] * this.volumeNormalizationFactor));
      }
    }
    
    // Every 100 processed frames, send an audio level update
    this.processedSamples += channel.length;
    if (this.processedSamples >= 4800) { // ~100ms at 48kHz
      this.port.postMessage({
        type: 'audio_level',
        level: rms,
        normalized: rms * this.volumeNormalizationFactor
      });
      this.processedSamples = 0;
    }
    
    // Return true to keep the processor alive
    return true;
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor); 