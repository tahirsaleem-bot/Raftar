const { getClient, isReady } = require('./src/whatsapp/whatsappClient');

const sendMessage = async () => {
  const client = getClient();

  if (!isReady()) {
    console.log('Waiting for WhatsApp client to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const phoneNumber = '923338587997@c.us';
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

  try {
    await client.sendMessage(phoneNumber, message);
    console.log('✅ Message sent to Safdarullah!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error sending message:', err.message);
    process.exit(1);
  }
};

sendMessage();
