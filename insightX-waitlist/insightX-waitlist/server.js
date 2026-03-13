/* ============================================================
   InsightX Waitlist — Backend Server
   Express + Supabase (Serverless) + Nodemailer
   ============================================================ */

require('dotenv').config();

const express  = require('express');
const path     = require('path');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const app  = express();

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Database Setup ─────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase configuration missing in .env');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Helper: get next position number
async function getNextPosition() {
  try {
    const { data, error } = await supabase
      .from('waitlist')
      .select('position')
      .order('position', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      return data[0].position + 1;
    }
    return 1;
  } catch (err) {
    console.error('Error getting next position:', err);
    return 1; // Fallback
  }
}

// ─── Email Transporter ──────────────────────────────────────
let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  transporter.verify()
    .then(() => console.log('✅ SMTP connected — emails will be sent'))
    .catch(err => {
      console.warn('⚠️  SMTP verification failed — emails disabled:', err.message);
      transporter = null;
    });
} else {
  console.log('ℹ️  SMTP not configured — emails disabled (set vars in .env)');
}

async function sendWelcomeEmail(email, position) {
  if (!transporter) return;

  const fromName  = process.env.FROM_NAME  || 'InsightX';
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: `🎉 You're #${position} on the InsightX Waitlist!`,
      html: `
        <div style="font-family:'Inter',Arial,sans-serif;background:#0a0a1a;color:#e2e8f0;padding:40px 20px;text-align:center;">
          <div style="max-width:520px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px 32px;">
            <h1 style="font-size:1.6rem;margin:0 0 8px;">Welcome to InsightX! 🚀</h1>
            <p style="color:#94a3b8;font-size:0.95rem;line-height:1.6;margin:0 0 24px;">
              You're officially on the waitlist. When we launch, you'll get
              <strong style="color:#a855f7;">lifetime Premium access</strong> — completely free.
            </p>
            <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:20px;margin-bottom:24px;">
              <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:4px;">Your position</div>
              <div style="font-size:2rem;font-weight:800;background:linear-gradient(135deg,#6366f1,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">#${position.toLocaleString('en-US')}</div>
            </div>
            <p style="color:#94a3b8;font-size:0.82rem;margin:0;">
              AI Validator · Data Analytics · SEO Suite — all included.
            </p>
          </div>
          <p style="color:#64748b;font-size:0.72rem;margin-top:20px;">
            © ${new Date().getFullYear()} InsightX. You received this because you joined our waitlist.
          </p>
        </div>
      `,
    });
    console.log(`📧 Welcome email sent to ${email}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${email}:`, err.message);
  }
}

// ─── API Routes ─────────────────────────────────────────────

// POST /api/waitlist — sign up
app.post('/api/waitlist', async (req, res) => {
  const { email } = req.body;

  // Validate
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'invalid_email', message: 'Please provide a valid email address.' });
  }

  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return res.status(400).json({ error: 'invalid_email', message: 'Please provide a valid email address.' });
  }

  try {
    // Check duplicate
    const { data: existing, error: checkError } = await supabase
      .from('waitlist')
      .select('position')
      .eq('email', trimmed)
      .single();

    if (existing) {
      return res.status(409).json({
        error: 'already_joined',
        message: 'This email is already on the waitlist.',
        email: trimmed,
        position: existing.position,
      });
    }

    // Insert
    const position = await getNextPosition();
    
    const { error: insertError } = await supabase
      .from('waitlist')
      .insert([{ email: trimmed, position: position }]);
      
    if (insertError) throw insertError;

    console.log(`✅ #${position} — ${trimmed} joined the waitlist`);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(trimmed, position);

    return res.status(200).json({ email: trimmed, position });
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'server_error', message: 'Something went wrong.' });
  }
});

// GET /api/waitlist/check — check if email exists
app.get('/api/waitlist/check', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'missing_email' });
  }

  try {
    const { data: row, error } = await supabase
      .from('waitlist')
      .select('position')
      .eq('email', email)
      .single();

    if (row) {
      return res.json({ exists: true, email, position: row.position });
    }
    return res.json({ exists: false });
  } catch (err) {
    // If Supabase returns no rows, single() throws an error (PGRST116)
    if (err.code === 'PGRST116') {
      return res.json({ exists: false });
    }
    console.error('Check error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/waitlist/count — total signups (public)
app.get('/api/waitlist/count', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true });
      
    if (error) throw error;
    
    return res.json({ total: count || 0 });
  } catch (err) {
    console.error('Count error:', err);
    return res.json({ total: 0 });
  }
});

// ─── Admin Routes ───────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function requireAdmin(req, res, next) {
  const pw = req.query.password || req.headers['x-admin-password'] || '';
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid admin password.' });
  }
  next();
}

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// GET /api/admin/emails — list all emails
app.get('/api/admin/emails', requireAdmin, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('waitlist')
      .select('id, email, position, joined_at')
      .order('position', { ascending: true });
      
    if (error) throw error;
    
    return res.json({ total: rows.length, emails: rows });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// GET /api/admin/export — CSV download
app.get('/api/admin/export', requireAdmin, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('waitlist')
      .select('email, position, joined_at')
      .order('position', { ascending: true });
      
    if (error) throw error;

    let csv = 'email,position,joined_at\\n';
    for (const r of rows) {
      csv += `"${r.email}",${r.position},"${r.joined_at}"\\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=insightx-waitlist.csv');
    return res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).send('Error exporting data');
  }
});

// ─── Export or Start Server ──────────────────────────────────
// Export for Vercel Serverless
module.exports = app;

// Start locally if not running in Vercel
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    try {
      if (supabaseUrl && supabaseKey) {
        const { count } = await supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true });
          
        console.log(`
        ╔══════════════════════════════════════════╗
        ║   InsightX Server (Supabase Mode)        ║
        ║   http://localhost:${PORT}                   ║
        ║   ${count || 0} email(s) in database                 ║
        ╚══════════════════════════════════════════╝
        `);
      } else {
        console.log(`Server listening on port ${PORT} (Warning: Supabase not configured)`);
      }
    } catch (err) {
      console.log(`Server listening on port ${PORT}`);
    }
  });
}

