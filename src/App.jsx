import { useState, useRef } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('KJV');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
      setResponse(null);
    } catch (err) {
      setError('Microphone access denied. Please enable microphone permissions.');
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const processAudio = async (audioBlob) => {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        
        // Send to API
        const response = await fetch('/api/process-question', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            audio: base64Audio,
            version: selectedVersion 
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to process question');
        }

        const data = await response.json();
        setResponse(data);
        setIsProcessing(false);

        // Speak the response
        speakResponse(data);
      };
    } catch (err) {
      setError('Failed to process your question. Please try again.');
      setIsProcessing(false);
      console.error('Error processing audio:', err);
    }
  };

  const speakResponse = (data) => {
    if ('speechSynthesis' in window && data.verses && data.verses.length > 0) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const text = data.verses.map(v => `${v.reference}: ${v.text}`).join('. ');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <header>
          <h1>Living Bible</h1>
          <p className="tagline">Ask and you shall receive</p>
        </header>

        <div className="translation-selector">
          <label htmlFor="version">Bible Translation:</label>
          <select 
            id="version" 
            value={selectedVersion} 
            onChange={(e) => setSelectedVersion(e.target.value)}
            disabled={isRecording || isProcessing}
          >
            <option value="KJV">King James Version (KJV)</option>
            <option value="WEB">World English Bible (WEB)</option>
            <option value="BSB">Berean Standard Bible (BSB)</option>
          </select>
        </div>

        <div className="main-content">
          {!response && !isProcessing && (
            <div className="instruction">
              Press and hold to ask your question
            </div>
          )}

          <button
            className={`mic-button ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <div className="spinner"></div>
            ) : isRecording ? (
              <div className="recording-indicator">
                <div className="pulse"></div>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            )}
          </button>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {response && (
            <div className="response-container">
              <div className="question">
                <strong>Your question:</strong> {response.question}
              </div>
              
              <div className="verses">
                {response.verses.map((verse, index) => (
                  <div key={index} className="verse">
                    <div className="verse-reference">{verse.reference}</div>
                    <div className="verse-text">{verse.text}</div>
                  </div>
                ))}
              </div>

              {response.footnotes && response.footnotes.length > 0 && (
                <div className="footnotes">
                  <h3>Context & Cross-References</h3>
                  {response.footnotes.map((note, index) => (
                    <div key={index} className="footnote">
                      <strong>{note.title}:</strong> {note.content}
                    </div>
                  ))}
                </div>
              )}

              <button 
                className="ask-another"
                onClick={() => setResponse(null)}
              >
                Ask Another Question
              </button>
            </div>
          )}
        </div>

        <footer>
          <p>
            {selectedVersion === 'KJV' && 'King James Version • New Testament'}
            {selectedVersion === 'WEB' && 'World English Bible • New Testament'}
            {selectedVersion === 'BSB' && 'Berean Standard Bible • New Testament'}
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
