const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xlaqsdmprxpcyrutfjxb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYXFzZG1wcnhwY3lydXRmanhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzA3MDcwNywiZXhwIjoyMDgyNjQ2NzA3fQ.tqiJ48O9l7bThGTIc1cewF7UWRzNvJEHNk-vAiiz74E'
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
    const { verses, version, versionName, isFirstBatch } = req.body;

    if (!verses || !version) {
      return res.status(400).json({ error: 'Missing verses or version' });
    }

    // If first batch, check if version already exists
    if (isFirstBatch) {
      const { count: existingCount } = await supabase
        .from('bible_verses')
        .select('*', { count: 'exact', head: true })
        .eq('version', version);

      if (existingCount > 0) {
        return res.status(200).json({
          success: true,
          message: `${versionName} already imported`,
          count: existingCount,
          alreadyExists: true
        });
      }
    }

    // Insert verses
    const { error } = await supabase
      .from('bible_verses')
      .insert(verses);

    if (error) {
      console.error('Insert error:', error);
      throw error;
    }

    return res.status(200).json({
      success: true,
      count: verses.length
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      error: 'Failed to upload verses',
      details: error.message
    });
  }
};
