const axios = require('axios');
const logger = require('../logger');
const { retry } = require('../utils/retry');

// ─── Location overrides: Employee homes + All schools ──────────
const LOCATION_OVERRIDES = {
  // Employee Home Locations (86 from Employees Data & Assets sheet)
  'sara fatima': { lat: 33.6204, lng: 73.1334 },
  'syeda iqra gellani': { lat: 33.7259, lng: 73.1085 },
  'shahreen siddique': { lat: 33.6532, lng: 72.9641 },
  'muhammad bilal sadiq': { lat: 33.6375, lng: 73.0656 },
  'anam masood': { lat: 33.4793, lng: 73.2038 },
  'momina raja': { lat: 33.7011, lng: 72.9687 },
  'summaya shakur': { lat: 33.5257, lng: 73.1484 },
  'ridda riaz': { lat: 33.7027, lng: 72.9768 },
  'nidda asif': { lat: 33.7, lng: 73.0584 },
  'eysha qadeer': { lat: 33.7028, lng: 72.977 },
  'misbah iqbal': { lat: 33.6651, lng: 73.0641 },
  'noman hameed khan': { lat: 33.663, lng: 73.0272 },
  'hiba anwer': { lat: 33.6397, lng: 73.0236 },
  'sehar sajjad': { lat: 33.6023, lng: 73.0139 },
  'hira abbas zaidi': { lat: 33.5564, lng: 73.0604 },
  'saba kokab': { lat: 33.6692, lng: 73.0657 },
  'syed ateeb ali kazmi': { lat: 33.5584, lng: 73.1502 },
  'tanveer abbas': { lat: 33.6831, lng: 73.118 },
  'esha qasim': { lat: 33.5038, lng: 73.0695 },
  'khadija akbar': { lat: 33.7231, lng: 73.0098 },
  'abdul waheed': { lat: 33.6442, lng: 72.9766 },
  'junaid ahmed': { lat: 33.5715, lng: 73.2105 },
  'warda anwar': { lat: 33.7032, lng: 72.9777 },
  'hifza nisar': { lat: 33.5726, lng: 73.1472 },
  'muzammil abbas': { lat: 33.7331, lng: 73.0766 },
  'hareem abid': { lat: 33.7028, lng: 72.977 },
  'abdul ahad': { lat: 33.6656, lng: 73.1562 },
  'maroof anwar': { lat: 33.6478, lng: 73.0392 },
  'javeria nayyab': { lat: 33.6624, lng: 73.0198 },
  'sumaya imran': { lat: 33.7174, lng: 73.0946 },
  'iiman maeen': { lat: 33.6572, lng: 72.854 },
  'iqra arshad': { lat: 33.631, lng: 72.9735 },
  'areej noshad': { lat: 33.5565, lng: 73.1338 },
  'maryam javed': { lat: 33.6132, lng: 72.8691 },
  'shafaq tahir': { lat: 33.593, lng: 73.134 },
  'ch hashir hussain shahid': { lat: 33.6192, lng: 73.0804 },
  'waneza firdous': { lat: 33.5408, lng: 73.1034 },
  'sammar amin': { lat: 33.6554, lng: 72.961 },
  'rida abbas': { lat: 33.6329, lng: 73.1268 },
  'wajiha malik': { lat: 33.6802, lng: 72.9962 },
  'asma zaheer': { lat: 33.6193, lng: 73.1172 },
  'muhammad abubakr': { lat: 33.6592, lng: 73.0616 },
  'ramisha riaz sheikh': { lat: 33.686, lng: 73.0313 },
  'hamza mehmood': { lat: 33.6384, lng: 73.0111 },
  'tehreem batool': { lat: 33.6, lng: 73.0386 },
  'syeda mehwish ali': { lat: 33.6488, lng: 73.0489 },
  'ifraah javed': { lat: 33.5465, lng: 73.0697 },
  'aneela khaliq': { lat: 33.6048, lng: 73.109 },
  'kamran taj': { lat: 33.6944, lng: 73.0463 },
  'munira shah': { lat: 33.7083, lng: 73.0834 },
  'sana ishtiaq': { lat: 33.6406, lng: 72.9766 },
  'mubasher irfan': { lat: 33.6638, lng: 73.0878 },
  'jamshaid ahmad': { lat: 33.6473, lng: 73.1139 },
  'salman sohail': { lat: 33.4837, lng: 73.0781 },
  'iffat maab': { lat: 33.5552, lng: 73.1361 },
  'bushra karim': { lat: 33.6659, lng: 73.0697 },
  'muhammad salman': { lat: 33.6442, lng: 73.1641 },
  'abdul rehman': { lat: 33.6876, lng: 73.0333 },
  'danish iqbal': { lat: 33.6366, lng: 72.9764 },
  'moiz khan': { lat: 33.6371, lng: 73.201 },
  'alamgeer abbas': { lat: 33.6359, lng: 72.9762 },
  'fareeda sanam': { lat: 33.6662, lng: 73.066 },
  'mehwish allah ditta': { lat: 33.5715, lng: 73.2105 },
  'mubashar zia': { lat: 33.6704, lng: 73.1403 },
  'hamza siddique': { lat: 33.6531, lng: 73.056 },
  'tehniat taqdees': { lat: 33.5736, lng: 73.1061 },
  'nouman alam': { lat: 33.7369, lng: 73.1696 },
  'rabia javed': { lat: 33.5897, lng: 73.1356 },
  'ashas khan': { lat: 33.6569, lng: 73.1572 },
  'abdul malik': { lat: 33.7119, lng: 73.1676 },
  'sana nawaz': { lat: 33.6857, lng: 72.9845 },
  'saman zahoor': { lat: 33.604, lng: 72.9927 },
  'naveera khan': { lat: 33.6469, lng: 72.8192 },
  'rosheen naeem': { lat: 33.6447, lng: 73.0395 },
  'arjumand': { lat: 33.6451, lng: 73.0402 },
  'hasnat tariq': { lat: 33.6123, lng: 73.0628 },
  'ayat butt': { lat: 33.7027, lng: 72.9768 },
  'maria karim': { lat: 33.6558, lng: 73.1541 },
  'shazmina sharif': { lat: 33.6963, lng: 72.9842 },
  'zarmeen kausar': { lat: 33.6465, lng: 72.9583 },
  'saima jabeen': { lat: 33.6417, lng: 72.9822 },
  'toseef ur rehman': { lat: 33.7104, lng: 73.1568 },
  'zainab zaheer': { lat: 33.56, lng: 73.0224 },
  'zainab  fatima': { lat: 33.5453, lng: 73.0956 },
  'saaim asif': { lat: 33.5771, lng: 73.0178 },
  'meerab din': { lat: 33.6016, lng: 73.0709 },

  // Special Locations (not employee homes or schools)
  'al_qaim town': { lat: 33.7189, lng: 73.1956 },
  'al_qaim town ': { lat: 33.7189, lng: 73.1956 },
  'imsb (i-x):phulgran': { lat: 33.7434, lng: 73.2183 },
  'imsb ( i_x):phulgran': { lat: 33.7434, lng: 73.2183 },
  'niete office': { lat: 33.7292, lng: 73.2086 },
  'niete office ': { lat: 33.7292, lng: 73.2086 },

  // All 340 Schools from Schools Data sheet
  'ims (i-v) g-6/1-1': { lat: 33.7069, lng: 73.0822 },
  'ims (i-v) g-6/1-3': { lat: 33.7134, lng: 73.0854 },
  'ims(i-v) g-6/1-4': { lat: 33.7089, lng: 73.0869 },
  'ims(i-v) g-6/4': { lat: 33.7142, lng: 73.0899 },
  'ims(i-v) g-6/2 caf√© iram': { lat: 33.7142, lng: 73.0818 },
  'imsg(i-viii) g-6/2': { lat: 33.7144, lng: 73.077 },
  'ims(i-v) g-6/2': { lat: 33.7195, lng: 73.0794 },
  'imsg (i-x) p.e. cly g-5': { lat: 33.7321, lng: 73.1068 },
  'ims(i-v) g-6/1-2': { lat: 33.71, lng: 73.0802 },
  'imsg (i-viii) g-7/3-2': { lat: 33.71, lng: 73.0667 },
  'ims(i-v) g-7/1': { lat: 33.7007, lng: 73.0692 },
  'ims(i-v) g-7/4': { lat: 33.7084, lng: 73.0754 },
  'imsg (i-viii) g-7/3-4': { lat: 33.7112, lng: 73.0736 },
  'ims(i-v) g-7/3-1': { lat: 33.7088, lng: 73.0682 },
  'ims (i-v) g-7/3-3': { lat: 33.7133, lng: 73.0717 },
  'imsg (i-viii) f-7/1': { lat: 33.7151, lng: 73.0541 },
  'ims(i-v) no.1 g-7/2': { lat: 33.7104, lng: 73.061 },
  'imsg (i-viii) f-7/4': { lat: 33.721, lng: 73.0643 },
  'ims(i-v) f-6/4': { lat: 33.7298, lng: 73.0834 },
  'imsg (i-x) p.m. colony g-5': { lat: 33.7285, lng: 73.1142 },
  'ims(i-v) f-6/1': { lat: 33.7236, lng: 73.0726 },
  'ims(i-v) f-6/3': { lat: 33.7353, lng: 73.0799 },
  'ims (i-v), f-7/2-4': { lat: 33.7226, lng: 73.0522 },
  'ims(i-v) f-7/2': { lat: 33.7173, lng: 73.0497 },
  'imsb (i-x) p.m. colony g-5': { lat: 33.7285, lng: 73.1142 },
  'ims(i-v) no.1 e-8': { lat: 33.7231, lng: 73.0392 },
  'ims(i-v) no.2 e-8': { lat: 33.7168, lng: 73.0288 },
  'imsg(i-x) e-9': { lat: 33.7096, lng: 73.0169 },
  'ims(i-v) e-7/4': { lat: 33.7277, lng: 73.0487 },
  'imsg (i-viii) g-8/4': { lat: 33.6941, lng: 73.0593 },
  'ims(i-v) no.1 g-8/4': { lat: 33.6978, lng: 73.0596 },
  'ims(i-v) no.2 g-8/4': { lat: 33.6959, lng: 73.0545 },
  'ims(i-v) no.1 g-8/1': { lat: 33.6926, lng: 73.0469 },
  'ims(i-v) no.2 g-8/1': { lat: 33.6896, lng: 73.0452 },
  'ims(i-v) no.3 g-8/1': { lat: 33.6891, lng: 73.0491 },
  'ims(i-v) no.1 g-8/2': { lat: 33.7002, lng: 73.0446 },
  'ims(i-v) no.2 g-8/2': { lat: 33.6956, lng: 73.0444 },
  'ims(i-v) pims g-8/3': { lat: 33.7015, lng: 73.0577 },
  'ims(i-v) f-8/2': { lat: 33.7125, lng: 73.0306 },
  'ims(i-v) no.2 g-9/4': { lat: 33.6842, lng: 73.0387 },
  'ims(i-v) no.1 g-9/4': { lat: 33.6865, lng: 73.0437 },
  'ims(i-v) no.3 st 68 g-9/3': { lat: 33.6918, lng: 73.0381 },
  'ims(i-v) no.2 st 7 g-9/3': { lat: 33.6907, lng: 73.0344 },
  'ims(i-v) no.1 g-9/3': { lat: 33.6954, lng: 73.0352 },
  'imsg(i-x) g-9/1': { lat: 33.6854, lng: 73.0315 },
  'ims(i-v) no.1 g-9/2': { lat: 33.6911, lng: 73.0272 },
  'ims(i-v) no.2 g-9/2': { lat: 33.6858, lng: 73.0254 },
  'ims(i-v) no.3 g-9/2': { lat: 33.6888, lng: 73.0279 },
  'ims(i-v) no.4 g-9/2': { lat: 33.6892, lng: 73.0244 },
  'ims(i-v) g-9/1': { lat: 33.6798, lng: 73.0305 },
  'ims(i-v) f-10/1': { lat: 33.6864, lng: 73.0044 },
  'ims(i-v) f-10/2': { lat: 33.6918, lng: 73.0005 },
  'ims(i-v) f-10/4': { lat: 33.6904, lng: 73.0114 },
  'imsg(i-x) g-10/3': { lat: 33.6858, lng: 73.0157 },
  'ims(i-v) g-10/3': { lat: 33.6839, lng: 73.0119 },
  'ims(i-v) g-10/4': { lat: 33.6774, lng: 73.0243 },
  'ims(i-v) g-10/1': { lat: 33.6716, lng: 73.0138 },
  'ims(i-v) no.1 g-10/2': { lat: 33.6774, lng: 73.0094 },
  'ims(i-v) no.2 g-10/2': { lat: 33.6812, lng: 73.0095 },
  'ims(i-v) g-11/1': { lat: 33.6644, lng: 72.9988 },
  'imsg(i-x) g-11/2': { lat: 33.6695, lng: 72.9929 },
  'ims(i-v) g-11/2': { lat: 33.6684, lng: 72.9901 },
  'ims(i-v) i-8/1': { lat: 33.6616, lng: 73.0688 },
  'imsg (i-viii) i-9/4': { lat: 33.6575, lng: 73.0641 },
  'ims(i-v) no.1 i-9/4': { lat: 33.6536, lng: 73.0625 },
  'ims(i-v) no.2 i-9/4': { lat: 33.6553, lng: 73.0609 },
  'imsg (i-viii) i-8/1': { lat: 33.6589, lng: 73.0701 },
  'ims(i-v) aiou colony': { lat: 33.6845, lng: 73.055 },
  'imsg (i-viii) i-10/4': { lat: 33.6463, lng: 73.0479 },
  'ims(i-v) no.1 i-10/1': { lat: 33.6411, lng: 73.0387 },
  'ims(i-v) no.2 i-10/1': { lat: 33.6407, lng: 73.0353 },
  'ims (i-v) i-10/2': { lat: 33.6485, lng: 73.0333 },
  'ims(i-v) no.2 i-9/1': { lat: 33.655, lng: 73.057 },
  'ims(i-v) no.1 i-9/1': { lat: 33.6523, lng: 73.0536 },
  'ims(i-v) no.2 g-7/2': { lat: 33.7035, lng: 73.0621 },
  'ims(i-v) f-8/3': { lat: 33.7148, lng: 73.0442 },
  'imsb (i-viii) i-8/1': { lat: 33.659, lng: 73.0709 },
  'imsb (i-x) bhara kau': { lat: 33.737, lng: 73.1736 },
  'imsb (i-x) chattar': { lat: 33.7846, lng: 73.2456 },
  'imsb (i-x) shahdara': { lat: 33.7818, lng: 73.1726 },
  'imsb (i-x), said pur': { lat: 33.7401, lng: 73.0678 },
  'imsb (i-viii), bobri': { lat: 33.763, lng: 73.2562 },
  'imsb (i-viii) jandala (f.a)': { lat: 33.7286, lng: 73.2817 },
  'imsb (i-viii), mohra noor nih': { lat: 33.7032, lng: 73.1607 },
  'imsb (i-x) phulgran f.a': { lat: 33.7434, lng: 73.2183 },
  'imsb (i-viii), kot hathial (nai abadi)': { lat: 33.7504, lng: 73.1798 },
  'imsb (i-viii), malwar': { lat: 33.779, lng: 73.0959 },
  'imsb (i-viii), satra meel': { lat: 33.7645, lng: 73.2203 },
  'imsb (i-v), athal': { lat: 33.7339, lng: 73.2295 },
  'imsb (i-v), bhuddo': { lat: 33.7991, lng: 73.1472 },
  'imsb (i-v), chahann mastal (f.a) h-11': { lat: 33.6491, lng: 73.0102 },
  'imsb (i-v), dhoke jerrani': { lat: 33.7259, lng: 73.1715 },
  'imsb (i-v), dhoke syedan': { lat: 33.7087, lng: 73.2001 },
  'imsb (i-v), dohala syedan': { lat: 33.7663, lng: 73.2433 },
  'imsb (i-v), kalran': { lat: 33.7835, lng: 73.261 },
  'imsb (i-v), malot': { lat: 33.7109, lng: 73.2135 },
  'imsb(i-v), mangial(f.a),': { lat: 33.7556, lng: 73.1805 },
  'imsb (i-v), mal': { lat: 33.6981, lng: 73.2186 },
  'imsb (i-v), noor pur shahan': { lat: 33.7463, lng: 73.1066 },
  'imsb (i-v), palali': { lat: 33.7196, lng: 73.2874 },
  'imsb (i-v), pind begwal': { lat: 33.6997, lng: 73.252 },
  'imsb (i-v), rumli': { lat: 33.7678, lng: 73.1356 },
  'imsb (i-v), sihali': { lat: 33.7108, lng: 73.2676 },
  'imsb (i-v), talhar (fa) ibd': { lat: 33.7657, lng: 73.0584 },
  'imsb (i-v), kot hathial, qaziabad': { lat: 33.7512, lng: 73.1894 },
  'imsb (i-v), gokina': { lat: 33.7736, lng: 73.0746 },
  'imsb (i-v), kuree': { lat: 33.6829, lng: 73.1837 },
  'imsb (i-viii), malpur': { lat: 33.7278, lng: 73.1429 },
  'imsb (i-v), rawal dam,': { lat: 33.6911, lng: 73.1158 },
  'imsb (i-viii), chatta bakhtawar': { lat: 33.6619, lng: 73.1542 },
  'imcg (i-xii), margalla town,': { lat: 33.6702, lng: 73.1058 },
  'imcg (i-xii), university colony (u.c)': { lat: 33.7463, lng: 73.1272 },
  'imsg (i-x), nhc': { lat: 33.6788, lng: 73.1481 },
  'imsg (i-x) gokina': { lat: 33.7753, lng: 73.0762 },
  'imsg (i-x) kurri': { lat: 33.6813, lng: 73.1781 },
  'imsg (i-x) phulgran': { lat: 33.7481, lng: 73.2159 },
  'imsg (i-x) talhar': { lat: 33.7707, lng: 73.0477 },
  'imcg (i-xii) maira begwal': { lat: 33.7395, lng: 73.2681 },
  'imsg (i-x) lakhwal': { lat: 33.6964, lng: 73.1419 },
  'imcg (i-xii) pind begwal': { lat: 33.7144, lng: 73.2335 },
  'imsg (i-x) noorpur shahan': { lat: 33.7454, lng: 73.1099 },
  'imsg (i-x) shahdra khurd': { lat: 33.7788, lng: 73.1676 },
  'imsg (i-x), said pur': { lat: 33.7402, lng: 73.0677 },
  'imsg (i-x), malot': { lat: 33.7133, lng: 73.2182 },
  'imsg (i-viii), shahdra kalan': { lat: 33.7938, lng: 73.1837 },
  'imsg (i-viii), bain nala': { lat: 33.718, lng: 73.2814 },
  'imsg (i-viii) mandla (fa) islamabad': { lat: 33.7649, lng: 73.1758 },
  'imsg (i-x), mohra noor': { lat: 33.7034, lng: 73.1608 },
  'imsg (i-viii), bhara kau': { lat: 33.7374, lng: 73.1887 },
  'imsg (i-viii), bobri': { lat: 33.7682, lng: 73.2579 },
  'imsg (i-viii), kot hathial': { lat: 33.7446, lng: 73.1684 },
  'imsg (i-viii), sanjalian': { lat: 33.7243, lng: 73.1848 },
  'imsg (i-v), athal': { lat: 33.7352, lng: 73.2343 },
  'imsg (i-v), (nhc) chak shehzad': { lat: 33.6807, lng: 73.1511 },
  'imsg (i-v), dhoke jerrani': { lat: 33.726, lng: 73.1715 },
  'imsg (i-v), kot hathial, nai abadi': { lat: 33.7507, lng: 73.1897 },
  'imsg (i-viii), mohrian': { lat: 33.6734, lng: 73.1871 },
  'imsg (i-v), pind begwal, dana': { lat: 33.7027, lng: 73.2444 },
  'imsg (i-v), shah pur': { lat: 33.7424, lng: 73.2027 },
  'imsg (i-v), subban': { lat: 33.7683, lng: 73.1817 },
  'imsg (i-v) , shahzad town': { lat: 33.6702, lng: 73.141 },
  'imsg (i-v), bhara kau, nai abadi': { lat: 33.7317, lng: 73.1792 },
  'imsg (i-v), malpur (f.a)': { lat: 33.7293, lng: 73.1479 },
  'imcg (i-xii) rawal town islamabad': { lat: 33.6843, lng: 73.1161 },
  'imsg (i-v) maira malpur': { lat: 33.7307, lng: 73.1419 },
  'imsg (i-x) nara syedan': { lat: 33.5747, lng: 73.2804 },
  'imsg (i-x) dhoke gangal': { lat: 33.6153, lng: 73.1159 },
  'imcg (i-x) pindmalkan': { lat: 33.5965, lng: 73.2616 },
  'imcg lohi bher': { lat: 33.5847, lng: 73.1639 },
  'imsg (i-x) humak': { lat: 33.5398, lng: 73.1395 },
  'imsg (i-x) gagri': { lat: 33.5571, lng: 73.1821 },
  'imsg (i-x) upran gohra': { lat: 33.5447, lng: 73.2531 },
  'imsg (i-viii) bhimber trar': { lat: 33.6066, lng: 73.2597 },
  'imsg (i-viii) mohri rawat': { lat: 33.5092, lng: 73.203 },
  'imsg (i-x) r/col. rawat': { lat: 33.4881, lng: 73.1993 },
  'imsg (i-viii) bhangril': { lat: 33.5042, lng: 73.1619 },
  'imsg (i-viii) rajwal': { lat: 33.5209, lng: 73.1325 },
  'imsg (i-x) dhaliala': { lat: 33.589, lng: 73.2046 },
  'imsg (i-viii) niazian': { lat: 33.542, lng: 73.1586 },
  'imsg (i-v) (m.t) humak': { lat: 33.5383, lng: 73.142 },
  'imsg (i-viii)peija': { lat: 33.5984, lng: 73.2289 },
  'imsg (i-v) pindory syedan': { lat: 33.6024, lng: 73.2875 },
  'imsg (i-viii) miana thub': { lat: 33.5609, lng: 73.2622 },
  'imsg (i-viii) jandala': { lat: 33.5684, lng: 73.2272 },
  'imsg (i-v) rawat': { lat: 33.4937, lng: 73.193 },
  'imsg (i-v) sheikhpur': { lat: 33.5212, lng: 73.2277 },
  'imsg (i-v) herdogher': { lat: 33.5568, lng: 73.2385 },
  'imsg (i-v) mughal': { lat: 33.5407, lng: 73.2571 },
  'imsg (i-v) sihala': { lat: 33.5451, lng: 73.2045 },
  'imsg (i-v) sihala mirzian': { lat: 33.5474, lng: 73.1879 },
  'imsg (i-v) hoon dhamial': { lat: 33.548, lng: 73.2189 },
  'imsg (i-v) gohra mast': { lat: 33.6097, lng: 73.2764 },
  'imsg (i-v) ladhiot': { lat: 33.579, lng: 73.259 },
  'imsg (i-v) humak': { lat: 33.536, lng: 73.139 },
  'imsg (i-v) gangota syedan': { lat: 33.5672, lng: 73.2151 },
  'imsg (i-v)boora bangial': { lat: 33.5964, lng: 73.1817 },
  'imsg (i-v) mohri mughal': { lat: 33.5414, lng: 73.2579 },
  'imsg (i-viii) ptc sihala': { lat: 33.555, lng: 73.2274 },
  'imsg (i-v) pwd col': { lat: 33.5688, lng: 73.1433 },
  'imsg (i-v) sihala khurd': { lat: 33.5607, lng: 73.193 },
  'imcb mohra nagial': { lat: 33.5354, lng: 73.1223 },
  'imsb (i-x) gagri': { lat: 33.5577, lng: 73.1817 },
  'imsb (i-x) dhaliala': { lat: 33.5893, lng: 73.207 },
  'imsb (i-x) banni saran': { lat: 33.4945, lng: 73.1866 },
  'imsb (i-v) sihala': { lat: 33.5465, lng: 73.2179 },
  'imsb (i-v) lohi bher': { lat: 33.5884, lng: 73.1644 },
  'imsb (i-v) bhimber trar': { lat: 33.6007, lng: 73.2537 },
  'imsb (i-viii) ara burji': { lat: 33.5396, lng: 73.1467 },
  'imsb (i-v) humak': { lat: 33.5348, lng: 73.1383 },
  'imsb (i-viii)s/mirzian': { lat: 33.542, lng: 73.1908 },
  'imsb (i-v) mughal': { lat: 33.5476, lng: 73.2664 },
  'imsb (i-viii) herdogher': { lat: 33.5636, lng: 73.2369 },
  'imsb (i-v) darwala': { lat: 33.6044, lng: 73.2119 },
  'imsb (i-v) boora bangial': { lat: 33.5862, lng: 73.181 },
  'imsb (i-v) pind malkan': { lat: 33.5919, lng: 73.2591 },
  'imsb (i-v) mohra kalu': { lat: 33.5269, lng: 73.1166 },
  'imsb (i-v) d/mai nawab': { lat: 33.555, lng: 73.1325 },
  'imsb (i-v) rajwal': { lat: 33.5223, lng: 73.1406 },
  'imsb (i-v) kortana': { lat: 33.5126, lng: 73.1704 },
  'imsb (i-v) bhangril': { lat: 33.5039, lng: 73.1615 },
  'imsb (i-v) chak': { lat: 33.5204, lng: 73.1968 },
  'imsb (i-v) mohri rawat': { lat: 33.5097, lng: 73.2036 },
  'imsb (i-viii), koral': { lat: 33.6089, lng: 73.1383 },
  'imsb (i-viii) nara syedan': { lat: 33.5807, lng: 73.2858 },
  'imsb (i-v)chak kamdar': { lat: 33.5684, lng: 73.2745 },
  'imsb (i-v). sigga': { lat: 33.5944, lng: 73.2825 },
  'imsg (i-v) cbr colony': { lat: 33.5582, lng: 73.1409 },
  'ims (i-v) soan garden, lohi bheer': { lat: 33.5637, lng: 73.1476 },
  'ims (i-v) gohra shahan': { lat: 33.5262, lng: 73.1376 },
  'imsb (i-x) naugazi': { lat: 33.6279, lng: 72.8817 },
  'imsb (i-x) i-14': { lat: 33.6144, lng: 72.9699 },
  'imsb (i-x) maira akku': { lat: 33.6737, lng: 72.9737 },
  'imsb (i-x) badana kalan': { lat: 33.6262, lng: 72.9027 },
  'imsg (i-x) sangjani': { lat: 33.674, lng: 72.8513 },
  'imsg (i-x) jhangi syedan (f.a.)': { lat: 33.6233, lng: 72.9485 },
  'imcg (i-xii) shah allah ditta': { lat: 33.7103, lng: 72.9179 },
  'imcg (i-xii) badana kalan': { lat: 33.6217, lng: 72.9083 },
  'imcg (i-xii) tarnol': { lat: 33.65, lng: 72.9135 },
  'imcg (i-xii) golra': { lat: 33.6954, lng: 72.9776 },
  'imsg (i-x) naugazi (f.a)': { lat: 33.6189, lng: 72.8768 },
  'imsg (i-x) bqb': { lat: 33.6629, lng: 72.9846 },
  'imsb (i-viii) dhoke jouri': { lat: 33.6986, lng: 72.8593 },
  'imsb (i-viii) dhoke paracha': { lat: 33.6662, lng: 72.8924 },
  'imsb (i-x) maira beri(f.a)': { lat: 33.7222, lng: 72.9886 },
  'imsb (i-viii) chellow': { lat: 33.6414, lng: 72.9466 },
  'imsg (i-viii) dhoke jouri': { lat: 33.6992, lng: 72.8602 },
  'imsg (i-viii) pind paracha': { lat: 33.6348, lng: 72.9422 },
  'imsg (i-viii) noon': { lat: 33.5874, lng: 72.9222 },
  'imsg (i-viii) dhreak mohri': { lat: 33.6809, lng: 72.9636 },
  'imsg (i-x) maira beri': { lat: 33.7217, lng: 72.9844 },
  'imsg (i-viii) dhoke paracha': { lat: 33.6607, lng: 72.8817 },
  'imsg (i-viii) sarae kharboza (f.a)': { lat: 33.6803, lng: 72.907 },
  'imsb (i-v) tarnol': { lat: 33.6552, lng: 72.9088 },
  'imsb (i-v) tamman': { lat: 33.6812, lng: 72.8591 },
  'imsb (i-v) sang jani': { lat: 33.6739, lng: 72.8514 },
  'imsb (i-v) dora': { lat: 33.6411, lng: 72.8711 },
  'imsb (i-v) sheikhpur': { lat: 33.5938, lng: 72.952 },
  'imsb (i-v) pind hoon': { lat: 33.6055, lng: 72.939 },
  'imsb (i-v) noon': { lat: 33.5842, lng: 72.923 },
  'imsb (i-v) shah allah ditta': { lat: 33.7109, lng: 72.9179 },
  'imsb i-v karamabad': { lat: 33.5969, lng: 72.9756 },
  'imsb (i-v) dhoke lubana': { lat: 33.7034, lng: 72.9018 },
  'imsb (i-v) johd': { lat: 33.6746, lng: 72.9172 },
  'imsb (i-v) sarae karboza': { lat: 33.6801, lng: 72.9057 },
  'imsb (i-v) pind parian': { lat: 33.6414, lng: 72.8927 },
  'imsb (i-v) dhreak mohri': { lat: 33.6808, lng: 72.9638 },
  'imsb (i-v) seri saral': { lat: 33.6925, lng: 72.9326 },
  'imsb (i-v) bokra': { lat: 33.6333, lng: 73.0066 },
  'imsb (i-v) jhangi syedan (fa)': { lat: 33.6264, lng: 72.9433 },
  'imsb (i-v) golra': { lat: 33.6944, lng: 72.9796 },
  'imsg (i-v) bheka syedan': { lat: 33.6876, lng: 72.9896 },
  'imsg (i-v) pind parian': { lat: 33.6434, lng: 72.8851 },
  'imsg (i-v) sheikhpur noon': { lat: 33.596, lng: 72.9544 },
  'imsg (i-v) dhoke hashoo': { lat: 33.6148, lng: 72.951 },
  'imsg (i-v) dhoke suleman': { lat: 33.6344, lng: 72.9726 },
  'imsg (i-v) sarae madhu': { lat: 33.6708, lng: 72.8639 },
  'imsg (i-v) i-14/3': { lat: 33.6201, lng: 72.9699 },
  'ims (i-viii) d-17': { lat: 33.6601, lng: 72.8502 },
  'imsb(i-x) tumair': { lat: 33.6754, lng: 73.2857 },
  'imsb(i-x)jagiot': { lat: 33.6744, lng: 73.2088 },
  'imsb(i-x) khanna dak': { lat: 33.6306, lng: 73.127 },
  'imcb,jaba tali': { lat: 33.649, lng: 73.1305 },
  'imsb(i-x)kirpa': { lat: 33.6178, lng: 73.2345 },
  'imcg,jagiot': { lat: 33.6704, lng: 73.2069 },
  'imcg,pehount': { lat: 33.6833, lng: 73.315 },
  'imcg,thanda pani (fa)': { lat: 33.6505, lng: 73.2202 },
  'imsb(i-x) khanna nai abadi': { lat: 33.6432, lng: 73.1116 },
  'imsb(i-viii) ali pur': { lat: 33.6468, lng: 73.1844 },
  'imsb(i-viii) della': { lat: 33.6663, lng: 73.3275 },
  'imsb(i-x) thanda pani': { lat: 33.6591, lng: 73.2336 },
  'imsb(i-viii) pehount': { lat: 33.6851, lng: 73.3139 },
  'imsg(i-viii) kh. dak': { lat: 33.6322, lng: 73.1257 },
  'imsg(i-x) new shakrial': { lat: 33.6438, lng: 73.1112 },
  'imsg (i-viii) kalia old (fa)': { lat: 33.6396, lng: 73.2815 },
  'imsg(i-x) jaba taili': { lat: 33.6487, lng: 73.1348 },
  'imsb(i-v)sohan': { lat: 33.6584, lng: 73.0993 },
  'imsb(i-v)sharifabad': { lat: 33.6195, lng: 73.1449 },
  'imsb(i-v)khadrappar': { lat: 33.6406, lng: 73.1648 },
  'imsb(i-v) ch. bangial': { lat: 33.627, lng: 73.1993 },
  'imsb(i-v)chirah': { lat: 33.6434, lng: 73.2866 },
  'imsb(i-viii) kijnah': { lat: 33.6823, lng: 73.3492 },
  'imsb(i-v) mohara solina': { lat: 33.6834, lng: 73.3256 },
  'imsb(i-v) jhang syden': { lat: 33.6446, lng: 73.2066 },
  'imsb(i-v)tarlai': { lat: 33.6412, lng: 73.1548 },
  'imsb(i-v)mohara': { lat: 33.6917, lng: 73.277 },
  'imsb(i-v)ara': { lat: 33.6348, lng: 73.2496 },
  'imsb(i-v)khanna kak': { lat: 33.6459, lng: 73.0961 },
  'imsb(i-v)pindmistrian': { lat: 33.6407, lng: 73.237 },
  'imsg(i-v)shakrial': { lat: 33.6314, lng: 73.105 },
  'imsg(i-v) khanna nai abadi': { lat: 33.6452, lng: 73.0966 },
  'imsg(i-v) no.i tarlai': { lat: 33.6411, lng: 73.1538 },
  'imsg(i-v) no.2 tarlai': { lat: 33.6414, lng: 73.1561 },
  'imsg(i-v)tamma': { lat: 33.6496, lng: 73.1678 },
  'imsg(i-v) ali pur (mv)': { lat: 33.6493, lng: 73.2007 },
  'imsg(i-v)ali pur frash': { lat: 33.6441, lng: 73.1783 },
  'imsg(i-v) severa': { lat: 33.6895, lng: 73.2269 },
  'imsg (i-v) chounial bangial': { lat: 33.619, lng: 73.1966 },
  'imsg(i-v)herno': { lat: 33.6578, lng: 73.2325 },
  'imsg(i-x) darkala': { lat: 33.6716, lng: 73.2321 },
  'imsg(i-v) dhok fathall': { lat: 33.6913, lng: 73.2678 },
  'imsg(i-v)tumiar': { lat: 33.6823, lng: 73.2836 },
  'imsg(i-viii) kijnah': { lat: 33.6878, lng: 73.3557 },
  'imsg(i-v) simly dam': { lat: 33.7167, lng: 73.3422 },
  'imsg(i-v) chirah': { lat: 33.6513, lng: 73.2804 },
  'imsg(i-v) kalia new': { lat: 33.6342, lng: 73.2724 },
  'imsg(i-v) jhang syedan': { lat: 33.6436, lng: 73.2069 },
  'imsg (i-v) chappar ghasota (f.a)': { lat: 33.6561, lng: 73.3046 },
  'imsg(i-v) chakhtan': { lat: 33.6718, lng: 73.3509 },
  'imsg(i-v) nilore': { lat: 33.6493, lng: 73.2414 },
  'imsg(i-v) punjgran (760)': { lat: 33.6434, lng: 73.1897 },
  'imsg(i-viii) sohan': { lat: 33.6545, lng: 73.1119 },
  'imsb(i-v)nilore': { lat: 33.6564, lng: 73.2768 },
  'imsg(i-v) ali pur south': { lat: 33.6399, lng: 73.1855 },
  'imsb(i-v) sirri': { lat: 33.6687, lng: 73.2208 },
  'imsg(i-v) frash town': { lat: 33.6511, lng: 73.2048 },
  'imsb(i-v)biath': { lat: 33.7036, lng: 73.3569 },
  'imcb, f-11/1': { lat: 33.6762, lng: 72.986 },
  'imcb, f-10/3': { lat: 33.6959, lng: 73.009 },
  'imcg, f-11/3': { lat: 33.6887, lng: 72.9917 },
  'imcb, f-7/3': { lat: 33.7272, lng: 73.0584 },
  'imcb, f-8/4': { lat: 33.7072, lng: 73.0412 },
  'imcb, g-10/4': { lat: 33.6762, lng: 73.0221 },
  'icb g-6/3': { lat: 33.7181, lng: 73.0886 },
  'imcb, i-10/1': { lat: 33.6441, lng: 73.0386 },
  'imcb, i-8/3': { lat: 33.6719, lng: 73.0699 },
  'imcg, st. 25, f-6/2': { lat: 33.7287, lng: 73.0661 },
  'icg, f-6/2': { lat: 33.7288, lng: 73.0725 },
  'imcg, f-7/4': { lat: 33.72, lng: 73.0653 },
  'imcg, f-8/1': { lat: 33.7082, lng: 73.0346 },
  'imcg, g-10/2': { lat: 33.6787, lng: 73.0118 },
  'imcg, st. # 23, i-10/4': { lat: 33.6451, lng: 73.0433 },
  'imcg, i-8/4': { lat: 33.6636, lng: 73.0748 },
  'imcg, f-10/2': { lat: 33.6896, lng: 73.0023 },
  'imcg, korang town': { lat: 33.5804, lng: 73.1436 },
  'imcg g-13/1': { lat: 33.6461, lng: 72.9629 },
  'imcg g-14/4': { lat: 33.6414, lng: 72.9499 },
  'imcb g-13/2': { lat: 33.6508, lng: 72.9547 },
  'imcb g-15': { lat: 33.6306, lng: 72.9221 },
  'imcb pakistan town': { lat: 33.5732, lng: 73.1343 },
  'imcb maira begwal': { lat: 33.743, lng: 73.2823 },
};

// OSRM API — free, open-source routing
const OSRM_API = 'https://router.project-osrm.org/route/v1/driving';

// ─── Convert DMS coordinates to decimal ──────────────────────────────────────
// Input: "33°42'24.9"N 73°04'55.8"E"
// Output: { lat: 33.706916, lng: 73.082166 }
function parseDMSCoordinates(dmsStr) {
  if (!dmsStr) return null;

  const regex = /(\d+)°(\d+)'([\d.]+)"([NSEW])\s+(\d+)°(\d+)'([\d.]+)"([NSEW])/;
  const match = dmsStr.match(regex);

  if (!match) return null;

  let lat = parseInt(match[1]) + parseInt(match[2])/60 + parseFloat(match[3])/3600;
  if (match[4] === 'S') lat = -lat;

  let lng = parseInt(match[5]) + parseInt(match[6])/60 + parseFloat(match[7])/3600;
  if (match[8] === 'W') lng = -lng;

  return { lat, lng };
}

// ─── Fuzzy match school names ─────────────────────────────────────────────────
function findBestSchoolMatch(locationName, schoolsData) {
  const location = locationName.toLowerCase().trim();

  // Try exact match first
  let match = schoolsData.find(s => s.name.toLowerCase() === location);
  if (match) return match;

  // Try substring match
  match = schoolsData.find(s =>
    s.name.toLowerCase().includes(location) || location.includes(s.name.toLowerCase())
  );
  if (match) return match;

  // Try abbreviation/partial match
  const locationWords = location.split(/[\s\-\/,]+/).filter(w => w.length > 2);
  for (const school of schoolsData) {
    const schoolWords = school.name.toLowerCase().split(/[\s\-\/,]+/);
    const matches = locationWords.filter(lw => schoolWords.some(sw => sw.includes(lw)));
    if (matches.length >= 2) return school;
  }

  return null;
}

// ─── Get coordinates from Schools sheet ──────────────────────────────────────
async function getSchoolCoordinates(schoolName, schoolsData) {
  // Check overrides first
  const override = LOCATION_OVERRIDES[schoolName.toLowerCase().trim()];
  if (override) return override;

  const school = findBestSchoolMatch(schoolName, schoolsData);

  if (!school || !school.coordinates) {
    logger.warn(`[distance] School not found: ${schoolName}`);
    return null;
  }

  return parseDMSCoordinates(school.coordinates);
}

// ─── Calculate distance between two coordinates via OSRM ──────────────────────
async function calculateDistance(lat1, lng1, lat2, lng2) {
  return await retry(async () => {
    const url = `${OSRM_API}/${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const response = await axios.get(url, { timeout: 5000 });

    if (response.data.routes && response.data.routes.length > 0) {
      const distanceMeters = response.data.routes[0].distance;
      const durationSeconds = response.data.routes[0].duration;
      const distanceKm = distanceMeters / 1000;

      return { distanceKm: Math.round(distanceKm * 10) / 10, durationMin: Math.round(durationSeconds / 60) };
    }
    return null;
  }, { label: '[distance]' }).catch(err => {
    logger.error(`[distance] OSRM error: ${err.message}`);
    return null;
  });
}

// ─── Calculate total route distance ──────────────────────────────────────────
// locations: [{ name, coordinates }, { name, coordinates }, ...]
async function calculateRouteDistance(locations) {
  if (!locations || locations.length < 2) return null;

  let totalDistance = 0;
  let totalDuration = 0;
  const segments = [];

  for (let i = 0; i < locations.length - 1; i++) {
    const from = locations[i];
    const to = locations[i + 1];

    if (!from.coordinates || !to.coordinates) {
      logger.warn(`[distance] Missing coordinates: ${from.name} or ${to.name}`);
      continue;
    }

    const segment = await calculateDistance(
      from.coordinates.lat,
      from.coordinates.lng,
      to.coordinates.lat,
      to.coordinates.lng
    );

    if (segment) {
      totalDistance += segment.distanceKm;
      totalDuration += segment.durationMin;
      segments.push({
        from: from.name,
        to: to.name,
        distance: segment.distanceKm,
        duration: segment.durationMin
      });
    }
  }

  return { totalDistance: Math.round(totalDistance * 10) / 10, totalDuration, segments };
}

// ─── Calculate fuel consumption ──────────────────────────────────────────────
function calculateFuel(distanceKm, vehicleType = 'car') {
  const fuelEfficiency = vehicleType === 'car' ? 9 : 15; // km/L
  const litersNeeded = distanceKm / fuelEfficiency;
  return Math.round(litersNeeded * 10) / 10;
}

// ─── Calculate amount (fuel price × consumption) ────────────────────────────
function calculateAmount(distanceKm, vehicleType = 'car', fuelPrice = 300) {
  // Default fuel price: Rs. 300/liter (configurable)
  const liters = calculateFuel(distanceKm, vehicleType);
  return Math.round(liters * fuelPrice);
}

// ─── Check discrepancy ──────────────────────────────────────────────────────
function checkDiscrepancy(calculatedKm, manualKm, threshold = 5) {
  if (!manualKm) return { flagged: false, reason: 'No manual entry' };
  const diff = Math.abs(calculatedKm - manualKm);
  return {
    flagged: diff > threshold,
    difference: Math.round(diff * 10) / 10,
    threshold
  };
}

module.exports = {
  parseDMSCoordinates,
  getSchoolCoordinates,
  calculateDistance,
  calculateRouteDistance,
  calculateFuel,
  calculateAmount,
  checkDiscrepancy
};
