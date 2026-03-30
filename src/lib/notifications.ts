import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as EngagementDB from '@/src/db/queries/engagement';
import * as SettingsDB from '@/src/db/queries/settings';

type Slot = 'morning' | 'lunch' | 'evening';
type MessageKind = 'streak' | 'readiness';

interface SlotConfig {
  hour: number;
  minute: number;
}

interface NotificationText {
  title: string;
  streak: string[];
  readiness: string[];
}

const SCHEDULE_DAYS = 14;
const SLOT_CONFIG: Record<Slot, SlotConfig> = {
  morning: { hour: 8, minute: 30 },
  lunch: { hour: 12, minute: 30 },
  evening: { hour: 19, minute: 0 },
};

const SLOT_ORDER: Slot[] = ['morning', 'lunch', 'evening'];

const COPY: Record<number, Record<Slot, NotificationText>> = {
  1: {
    morning: {
      title: 'Dobré ráno, šampión',
      streak: [
        'Začni deň krátkym tréningom a podrž si streak.',
        '2 minúty ráno, veľký rozdiel na skúške.',
        'Dnešný mini tréning = pokojnejšia hlava na teste.',
      ],
      readiness: [
        'Dnes už ideš skvele. Pozri si svoju pripravenosť.',
        'Streak je hotový. Skontroluj, ako rastie tvoje skóre pripravenosti.',
        'Máš to dnes splnené. Otvor appku a nakopni exam readiness.',
      ],
    },
    lunch: {
      title: 'Obedná turbo dávka',
      streak: [
        'Rýchle opakovanie cez obed a streak pokračuje.',
        'Jedna otázka počas obeda je stále výhra.',
        'Daj si krátky pit-stop v appke a drž tempo.',
      ],
      readiness: [
        'Skvelý deň pokračuje. Pozri, kam sa posunul readiness.',
        'Streak drží. Jeden check readiness a vieš, čo trénovať ďalej.',
        'Máš odpracované. Teraz mrkni na exam readiness.',
      ],
    },
    evening: {
      title: 'Večerné finále',
      streak: [
        'Uzavri deň krátkym tréningom a nestrácaj rytmus.',
        'Večer je ideálny na upevnenie správnych odpovedí.',
        'Daj si posledný push dnes a streak ostane živý.',
      ],
      readiness: [
        'Dnes už máš streak. Večer patrí kontrole pripravenosti.',
        'Super práca dnes. Pozri si exam readiness pred spaním.',
        'Dnešok je splnený, teraz dolaď skóre pripravenosti.',
      ],
    },
  },
  2: {
    morning: {
      title: 'Good morning, driver',
      streak: [
        'Start with a quick round and keep your streak alive.',
        'Two focused minutes now saves stress later.',
        'Tiny morning session, big exam confidence boost.',
      ],
      readiness: [
        'You already showed up today. Check your exam readiness.',
        'Streak locked for today, now push your readiness score.',
        'Great start today. Open the app and level up readiness.',
      ],
    },
    lunch: {
      title: 'Lunch break challenge',
      streak: [
        'Use your lunch break for one quick win.',
        'One short practice block keeps momentum strong.',
        'A tiny lunch session still counts. Keep the streak rolling.',
      ],
      readiness: [
        'You already practiced today. Time to check readiness.',
        'Today is on track. Tap in and boost exam readiness.',
        'Nice consistency. Review your readiness and next weak spots.',
      ],
    },
    evening: {
      title: 'Evening checkpoint',
      streak: [
        'Close the day with a short practice run.',
        'One evening round now keeps your streak unbroken.',
        'Finish strong tonight and make tomorrow easier.',
      ],
      readiness: [
        'Streak done for today. Give exam readiness one more push.',
        'You already did the hard part. Check readiness before bed.',
        'Great day logged. Open the app and sharpen readiness.',
      ],
    },
  },
  3: {
    morning: {
      title: 'Jó reggelt, sofőr',
      streak: [
        'Kezdd a napot egy rövid körrel, és tartsd a sorozatot.',
        'Pár perc gyakorlás reggel, sokkal nyugodtabb vizsga.',
        'Egy gyors reggeli ismétlés ma is számít.',
      ],
      readiness: [
        'Ma már gyakoroltál. Nézd meg a vizsgafelkészültséget.',
        'A mai sorozat rendben, most emeld a readiness pontot.',
        'Szép munka ma. Nyisd meg az appot és nézd a readiness-t.',
      ],
    },
    lunch: {
      title: 'Ebédszünetes mini kihívás',
      streak: [
        'Egy rövid ebédszünetes kör, és marad a lendület.',
        'Egyetlen gyakorlás ebédnél is előrébb visz.',
        'Gyors pit-stop az appban, és él tovább a sorozat.',
      ],
      readiness: [
        'Ma már haladtál. Ideje ránézni a readiness-re.',
        'Megvan a mai alap, most finomhangold a felkészültséget.',
        'Jól állsz ma. Nyisd meg és nézd meg az exam readiness-t.',
      ],
    },
    evening: {
      title: 'Esti zárás',
      streak: [
        'Zárd a napot egy rövid gyakorlással.',
        'Egy esti kör, és a sorozat sértetlen marad.',
        'Befejezésként még egy push, holnap hálás leszel érte.',
      ],
      readiness: [
        'A mai sorozat már megvan. Nézd meg a readiness állapotot.',
        'Szuper nap volt. Lefekvés előtt egy readiness check.',
        'A mai munka kész, most jöhet az exam readiness.',
      ],
    },
  },
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLanguageCopy(lang: number): Record<Slot, NotificationText> {
  return COPY[lang] || COPY[2];
}

function pickVariant(options: string[], slot: Slot, date: Date): string {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const slotOffset = SLOT_ORDER.indexOf(slot) * 7;
  const idx = Math.abs(dayOfYear + slotOffset) % options.length;
  return options[idx];
}

function makeSlotDate(baseDate: Date, slot: Slot): Date {
  const cfg = SLOT_CONFIG[slot];
  const d = new Date(baseDate);
  d.setHours(cfg.hour, cfg.minute, 0, 0);
  return d;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  return status === 'granted';
}

export async function syncNotificationsWithCurrentSettings(): Promise<void> {
  // Notifications scheduling is temporarily disabled while push/notification
  // capabilities are turned off at the native level. This keeps the app from
  // calling into `expo-notifications` with an invalid trigger configuration
  // and avoids runtime errors during development installs.
  if (Platform.OS === 'web') return;
  return;
}

