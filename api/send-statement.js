import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, bcc, subject, html } = req.body;

    const transporter = nodemailer.createTransport({
      host: 'smtp.mailplug.co.kr',
      port: 465,
      secure: true, // SSL 사용
      auth: {
        user: 'newgenes@newgenesci.com',
        pass: 'OMe.v8a->8v&oJ(*CT2h'
      }
    });

    const mailOptions = {
      from: '"뉴진사이언스" <newgenes@newgenesci.com>',
      to: to,
      bcc: bcc || 'newgenes@newgenesci.com',
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('SMTP sending error:', error);
    return res.status(500).json({ error: error.message });
  }
}
