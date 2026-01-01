const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
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
    const { bibleData, version, versionName } = req.body;

    if (!bibleData || !version) {
      return res.status(400).json({ error: 'Missing Bible data or version' });
    }

    console.log(`Starting import for ${version} (${versionName})`);
    
    // Parse Bible JSON - handle multiple possible formats
    let verses = [];
    
    // Format 1: Array of books
    if (Array.isArray(bibleData)) {
      bibleData.forEach(book => {
        const bookName = book.name || book.book;
        (book.chapters || []).forEach((chapter, chapterIndex) => {
          (chapter.verses || chapter).forEach((verseObj, verseIndex) => {
            const verseText = typeof verseObj === 'string' ? verseObj : (verseObj.text || verseObj.verse);
            verses.push({
              version,
              book: bookName,
              chapter: chapterIndex + 1,
              verse: verseIndex + 1,
              text: verseText.trim()
            });
          });
        });
      });
    } 
    // Format 2: Object with books as keys
    else if (typeof bibleData === 'object') {
      Object.keys(bibleData).forEach(bookKey => {
        const book = bibleData[bookKey];
        const bookName = book.name || bookKey;
        
        if (book.chapters) {
          Object.keys(book.chapters).forEach(chapterNum => {
            const chapter = book.chapters[chapterNum];
            Object.keys(chapter).forEach(verseNum => {
              verses.push({
                version,
                book: bookName,
                chapter: parseInt(chapterNum),
                verse: parseInt(verseNum),
                text: chapter[verseNum].trim()
              });
            });
          });
        }
      });
    }

    if (verses.length === 0) {
      return res.status(400).json({ error: 'No verses found in uploaded file' });
    }

    console.log(`Parsed ${verses.length} verses from ${version}`);

    // Check if this version already exists
    const { count: existingCount } = await supabase
      .from('bible_verses')
      .select('*', { count: 'exact', head: true })
      .eq('version', version);

    if (existingCount > 0) {
      console.log(`${version} already exists with ${existingCount} verses`);
      return res.status(200).json({
        success: true,
        message: `${versionName} already imported`,
        count: existingCount,
        alreadyExists: true
      });
    }

    // Insert in batches of 500
    const batchSize = 500;
    let imported = 0;

    for (let i = 0; i < verses.length; i += batchSize) {
      const batch = verses.slice(i, i + batchSize);
      const { error } = await supabase
        .from('bible_verses')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${i}-${i + batchSize}:`, error);
        throw error;
      }

      imported += batch.length;
      console.log(`Imported ${imported}/${verses.length} verses`);
    }

    return res.status(200).json({
      success: true,
      message: `${versionName} imported successfully`,
      count: imported
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      error: 'Failed to import Bible data',
      details: error.message
    });
  }
};
