const QRCode = require('qrcode');
const { Client } = require('whatsapp-web.js');
const { LocalAuth } = require('whatsapp-web.js');

// Generate QR code as image
async function generateQR() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    },
  });

  client.on('qr', async (qr) => {
    console.log('🔄 Generating QR code image...');
    try {
      // Save as image file
      await QRCode.toFile('./assets/whatsapp-qr.png', qr, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      console.log('✅ QR code saved to: assets/whatsapp-qr.png');
      console.log('📱 Open this file and scan with WhatsApp');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  });

  client.initialize();
}

generateQR();
