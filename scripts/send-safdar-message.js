const { getClient, isReady } = require('./src/whatsapp/whatsappClient');

setTimeout(async () => {
  const client = getClient();

  if (!isReady()) {
    console.log('WhatsApp not ready');
    process.exit(1);
  }

  try {
    const message = `Assalamu Alaikum Safdarullah,

Mein Raftar hoon - ek comprehensive field operations system jo aapke logistics, distance calculations, meter readings, aur team coordination ko manage karta hoon.

Main features:
- WhatsApp se directly meter reading photos receive karti hoon
- Automatically KM extract karti hoon images se
- Google Sheets mein real-time updates
- Daily scheduling (10AM, 3PM, 5PM readings)
- Route optimization aur fuel consumption tracking

Aap simply meter reading photos bhejein groups mein, aur main baaki sab handle kar doonga.

Sent by Raftar`;

    await client.sendMessage('923338587997@c.us', message);
    console.log('✅ Message sent to Safdarullah successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error sending message:', err.message);
    process.exit(1);
  }
}, 1000);
