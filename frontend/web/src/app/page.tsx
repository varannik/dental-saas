import { MicrophoneButton } from '@/components/MicrophoneButton';
import { Transcript } from '@/components/Transcript';
import { VoiceAssistantProvider } from '@/contexts/VoiceAssistantContext';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen p-8 bg-gradient-to-br from-white to-gray-50">
      <header className="flex justify-between items-center mb-12">
        <h1 className="text-2xl font-bold text-gray-800">AI Voice Assistant</h1>
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={120}
          height={25}
          priority
        />
      </header>
      
      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full gap-8">
        <VoiceAssistantProvider>
          <div className="w-full flex flex-col gap-8 items-center">
            {/* Transcript area */}
            <Transcript className="w-full shadow-md" maxHeight="400px" />
            
            {/* Controls area */}
            <div className="flex flex-col items-center gap-4">
              <MicrophoneButton size="lg" />
              <p className="text-sm text-gray-600 text-center max-w-md">
                Click the microphone button to start speaking to the AI assistant. 
                The assistant will process your voice and respond back.
              </p>
            </div>
          </div>
        </VoiceAssistantProvider>
      </main>
      
      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} AI Voice Assistant - Built with Next.js, WebRTC, and FastAPI</p>
        <div className="mt-2 flex gap-4 justify-center">
          <a 
            href="#" 
            className="hover:underline"
            onClick={(e) => {
              e.preventDefault();
              alert('Privacy policy would go here');
            }}
          >
            Privacy Policy
          </a>
          <a 
            href="#" 
            className="hover:underline"
            onClick={(e) => {
              e.preventDefault();
              alert('Terms of service would go here');
            }}
          >
            Terms of Service
          </a>
        </div>
      </footer>
    </div>
  );
}
