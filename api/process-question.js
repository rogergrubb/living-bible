const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audio, version = 'KJV' } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'No audio provided' });
    }

    // Step 1: Transcribe audio using Groq Whisper
    const audioBuffer = Buffer.from(audio, 'base64');
    const transcription = await groq.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'json',
    });

    const question = transcription.text;

    // Step 2: Find relevant Bible verses using GPT-4
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Biblical scholar expert in the King James Version New Testament. 
          
Your task is to find the most relevant Bible verses that directly answer the user's question.

CRITICAL REQUIREMENTS:
1. ONLY use verses from the New Testament (Matthew through Revelation)
2. Return EXACT verse references (e.g., "John 3:16", "Romans 8:28")
3. Return 1-5 of the most relevant verses
4. Include brief context/footnotes explaining relevance
5. If no verses directly address the question, find related verses and explain the connection

Response format (JSON):
{
  "verses": [
    {
      "reference": "Book Chapter:Verse",
      "reasoning": "Why this verse answers the question"
    }
  ],
  "footnotes": [
    {
      "title": "Historical Context" or "Cross-Reference" or "Theological Note",
      "content": "Brief explanation"
    }
  ]
}`
        },
        {
          role: 'user',
          content: question
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const gptResponse = JSON.parse(completion.choices[0].message.content);

    // Step 3: Fetch exact KJV text for each verse from Supabase
    const versesWithText = await Promise.all(
      gptResponse.verses.map(async (verse) => {
        const [bookChapter, verseNum] = verse.reference.split(':');
        const parts = bookChapter.trim().split(' ');
        const verseNumber = parseInt(verseNum);
        
        // Handle books with numbers (e.g., "1 John")
        let book, chapter;
        if (!isNaN(parseInt(parts[0]))) {
          book = `${parts[0]} ${parts[1]}`;
          chapter = parseInt(parts[2]);
        } else if (parts.length === 3) {
          // Handle multi-word books (e.g., "Song of Solomon")
          book = `${parts[0]} ${parts[1]}`;
          chapter = parseInt(parts[2]);
        } else {
          book = parts[0];
          chapter = parseInt(parts[1]);
        }

        // Query Supabase for the exact verse text
        const { data, error } = await supabase
          .from('bible_verses')
          .select('text')
          .eq('version', version)
          .eq('book', book)
          .eq('chapter', chapter)
          .eq('verse', verseNumber)
          .single();

        if (error || !data) {
          console.error('Error fetching verse:', error, verse.reference);
          // Fallback: try to get from bible-api.com
          try {
            const response = await fetch(`https://bible-api.com/${verse.reference}?translation=kjv`);
            const apiData = await response.json();
            return {
              reference: verse.reference,
              text: apiData.text?.trim() || 'Verse not found',
            };
          } catch (e) {
            return {
              reference: verse.reference,
              text: 'Verse text unavailable',
            };
          }
        }

        return {
          reference: verse.reference,
          text: data.text,
        };
      })
    );

    // Step 4: Return response
    return res.status(200).json({
      question,
      verses: versesWithText,
      footnotes: gptResponse.footnotes || [],
    });

  } catch (error) {
    console.error('Error processing question:', error);
    return res.status(500).json({ 
      error: 'Failed to process question',
      details: error.message 
    });
  }
};
