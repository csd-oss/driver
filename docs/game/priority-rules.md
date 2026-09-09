# Priority rules for the "Who goes first?" engine (Slovak law)

Everything below is taken from the consolidated primary texts, not from
textbooks. Each rule quotes the Slovak original with its paragraph and letter
so the engine can be checked against the law and the exam answer key.

## Sources

| Text | Wording used | Where fetched |
| --- | --- | --- |
| Zákon č. 8/2009 Z. z. o cestnej premávke ("the act") | consolidated, effective 1 Sep 2026 | `https://static.slov-lex.sk/static/SK/ZZ/2009/8/20260901.html` |
| the same act, earlier wordings (for history) | 1 Feb 2009, 1 Jan 2016, 1 Dec 2019, 1 Jan 2020, 1 Apr 2020 | same URL pattern with the date |
| Vyhláška č. 30/2020 Z. z. o dopravnom značení ("the 2020 regulation") | effective 31 Mar 2024, incl. annexes 2 to 7 (PDF) | `https://static.slov-lex.sk/static/SK/ZZ/2020/30/20240331.html` and `.../pdf/prilohy/SK/ZZ/2020/30/20240331_*.pdf` |
| Vyhláška č. 9/2009 Z. z. ("the 2009 regulation"), the sign annex the question bank was written against | wording effective 1 Jan 2016 (last consolidated wording with the sign annex; the annex was dropped on 1 Apr 2020) | `https://static.slov-lex.sk/static/SK/ZZ/2009/9/20160101.html` |

Both `zakonypreludi.sk` and the JavaScript front end of `slov-lex.sk` refuse
non-browser clients; the static mirror above serves the same consolidated
text.

Section references: `§20(2)` means § 20 ods. 2; `§2(2)(c)` means § 2 ods. 2
písm. c). "A3 201" means annex 3 of the 2020 regulation, sign number 201.
Engine vocabulary (`signs`, `mainRoad`, `control`, `from`/`to`, arms
`N E S W`) is the one in `docs/game/scene-format.md`.

## 1. Definitions

**Give way (dať prednosť v jazde)** - §2(2)(c):
> „dať prednosť v jazde povinnosť účastníka cestnej premávky počínať si tak, aby ten, kto má prednosť v jazde, nemusel náhle zmeniť smer alebo rýchlosť jazdy"

Giving way is a duty of behaviour, not a duty to stop. Only the STOP sign
adds a mandatory halt (§20(4)).

**Intersection (križovatka)** - §2(2)(k):
> „križovatkou miesto, kde sa cesty úrovňovo pretínajú alebo stýkajú; za križovatku sa nepovažuje miesto, kde sa účelovou cestou napája pozemok v blízkosti cesty, areál s obmedzeným prístupom, oplotený objekt, garáž, parkovisko, obratisko vozidiel hromadnej dopravy, čerpacia stanica a podobné miesto, ktoré poskytuje služby účastníkom cestnej premávky, ani vyústenie poľnej cesty, lesnej cesty, cestičky pre cyklistov, obytnej zóny, pešej zóny a podobných miest na inú cestu"

So a driveway, car park, petrol station, field or forest road, cycle path,
residential zone or pedestrian zone joining a road is **not** an intersection.
§20 (priority at intersections) does not apply there at all; §21 does. This
is the legal basis of `layout: "entry"`.

**Intersection boundary (hranica križovatky)** - §2(2)(f):
> „hranicou križovatky miesto, ktoré tvorí kolmica na os vozovky v mieste, kde sa pre križovatku začína zakrivenie vozovky"

**Controlled intersection (križovatka s riadenou premávkou)** - §2(2)(l):
> „križovatkou s riadenou premávkou križovatka, na ktorej je premávka riadená svetelnými signálmi, príslušníkom Policajného zboru (ďalej len „policajt"), príslušníkom Vojenskej polície (ďalej len „vojenský policajt") alebo inou oprávnenou osobou"

**Vehicle (vozidlo)** - §2(2)(y):
> „vozidlom motorové vozidlo, malé elektrické vozidlo, nemotorové vozidlo a električka"

A tram is a vehicle. Every rule written for "vozidlo" (in particular the
right-hand rule in §20(2) and the main-road rule in §20(1)) applies to trams
unless a rule says otherwise. A bicycle is a "nemotorové vozidlo" (§2(2)(o))
and therefore also a vehicle.

**Pedestrian (chodec)** - §2(2)(g), first clause:
> „chodcom účastník cestnej premávky pohybujúci sa pešo; ..."
(the letter goes on to include people pushing prams, bicycles, on skates, etc.)

**Emergency vehicle (vozidlo s právom prednostnej jazdy)** - §2(2)(z) and (af):
> „vozidlom s právom prednostnej jazdy vozidlo, ktoré pri plnení špeciálnych úloh používa zvláštne výstražné znamenie"
> „zvláštnym výstražným znamením typické zvukové znamenie doplnené zvláštnym výstražným modrým svetlom alebo červeným svetlom, prípadne ich kombináciou"

The status is tied to the *use* of the signal (siren plus blue/red light).

**Main road / side road (hlavná cesta / vedľajšia cesta)**: the act does
**not** define them. They exist only through signs. §20(1) speaks of "vedľajšia
cesta označená dopravnou značkou „Daj prednosť v jazde" alebo „Stoj, daj
prednosť v jazde"" and the 2020 regulation A4 302 says „Značka označuje
začiatok alebo priebeh hlavnej cesty" (see section 3). Under the 2009
regulation, P 1 „označuje vedľajšiu cestu pred križovatkou s hlavnou cestou"
and P 8 „označuje hlavnú cestu".

**Roundabout (kruhový objazd)**: also not defined in the act. It is the
place marked by the sign "Kruhový objazd" (A3 213 in 2020, C 7 in 2009); the
act refers to it in §20(5) and §30(5).

**Endanger / obstruct** - §2(2)(q) and (p):
> „neohrozením povinnosť účastníka cestnej premávky počínať si tak, aby inému účastníkovi cestnej premávky nevzniklo nijaké nebezpečenstvo"
> „neobmedzením povinnosť účastníka cestnej premávky počínať si tak, aby inému účastníkovi cestnej premávky neprekážal"

## 2. Hierarchy of control

1. **Police officer's instructions beat signs and lights.** §60(3):
   > „Pokyny policajta, vojenského policajta a pokyny inej oprávnenej osoby sú nadradené pokynom vyplývajúcim z dopravných značiek a dopravných zariadení."
   Light signals are given by "svetelné signalizačné zariadenia", which are
   dopravné zariadenia (2020 regulation §13(1)(a), §13(2)), so the officer
   overrides the lights as well.
2. **Lights beat priority signs.** 2020 regulation §14:
   > „Prednosť v jazde vyplývajúca zo svetelných signálov je nadradená prednosti v jazde určenej dopravnými značkami."
3. **Signs beat the general rules.** §60(2):
   > „Úprava cestnej premávky vykonaná dopravnými značkami a dopravnými zariadeniami je nadradená všeobecnej úprave cestnej premávky."
4. **General rules** (right-hand rule, left-turn rule) apply when nothing
   above decides.
5. Duties that are never switched off: give way to an emergency vehicle
   (§40(9)); allow pedestrians to cross (§4a, §19(7)); do not endanger
   anyone (§3(2)(a), §2(2)(q)).

Engine order: `control.type === "police"` -> `control.type === "lights"` ->
`signs`/`mainRoad` -> §20(2)/§19(4). Within each level the lower levels
still resolve ties between vehicles that the higher level lets go together
(e.g. two "Voľno" vehicles at a police-controlled junction still apply
§19(4) between themselves; see 5 and 6).

## 3. Priority at intersections - ordered rules for the engine

Apply in this order. A rule only ranks pairs of vehicles whose paths
conflict; two vehicles whose paths do not cross are simultaneous.

### R1. Emergency vehicle with the special signal on goes first

§40(9):
> „Vodič iného vozidla je povinný vozidlu s právom prednostnej jazdy a vozidlu, ktoré sprevádza, umožniť bezpečný a plynulý prejazd, a ak je to potrebné, aj zastaviť vozidlo na takom mieste, aby im neprekážalo."

§40(1): the emergency driver is exempt from the rules (except §3(2)(c) and
§4(2)(a) to (g)) „pričom je povinný dbať na potrebnú opatrnosť tak, aby iných
účastníkov cestnej premávky neohrozil". Pedestrians must not step onto the
road when one approaches (§53(1)).

Engine: a vehicle with `"kind": "emergency", "siren": true` outranks every
other vehicle regardless of signs, lights or the right-hand rule. A parked
vehicle with blue lights is a different case (§40(11): slow down, be
careful); the status needs the signal to be *in use* (§2(2)(z)).

### R2. Police officer (see section 5)

### R3. Light signals (see section 6)

### R4. Signed priority: side road yields to main road

§20(1):
> „Vodič, ktorý prichádza do križovatky po vedľajšej ceste označenej dopravnou značkou „Daj prednosť v jazde" alebo „Stoj, daj prednosť v jazde", je povinný dať prednosť v jazde vozidlám a ostatným účastníkom cestnej premávky prichádzajúcim po hlavnej ceste vrátane cyklistov idúcich súbežne s hlavnou cestou."

§20(4) (STOP adds a mandatory halt, nothing else):
> „Na príkaz dopravnej značky „Stoj, daj prednosť v jazde!" vodič je povinný zastaviť vozidlo na takom mieste, odkiaľ má na križovatku náležitý rozhľad."

2020 regulation A3 201 „Daj prednosť v jazde!": „Značka ukladá vodičovi
povinnosť dať prednosť v jazde." A3 202 „Stoj, daj prednosť v jazde!":
„Značka ukladá vodičovi povinnosť zastaviť vozidlo a dať prednosť v jazde.
Vodič je povinný zastaviť vozidlo a) na značke STOP čiara alebo b) na takom
mieste, odkiaľ má náležitý rozhľad na križovatku alebo na železničnú trať."

Engine consequences:

- `"yield"` and `"stop"` rank identically. The vehicle on that arm waits
  for **every** vehicle (car, tram, bicycle) arriving on a main-road arm,
  whatever direction the main-road vehicle is going, including a main-road
  vehicle turning left onto the side road.
- Which arms are main: `mainRoad` when set (from panel A5 510 / P 13-P 15);
  otherwise the straight continuation of the arm carrying `"main"`. The
  regulation only says where the main road *is*; it never says a straight
  main road is assumed, so treat that as the exam convention, not law.
- Vehicles that are all on the main road rank among themselves by R5-R6.
  The act does not say this in so many words; it follows from §20(2)
  „Ak prednosť v jazde nevyplýva z odseku 1 ..." (when nothing follows from
  the signs, the general rule applies). Same for two side-road vehicles
  after all main-road vehicles have gone.
- When the main road bends (`mainRoad: ["W","N"]`), a vehicle going `W -> N`
  is on the main road even though geometrically it turns; a vehicle going
  `N -> E` is on the main road too (it *leaves* it). Between two main-road
  vehicles use R5/R6 on geometry: `N -> E` is a left turn, `W` is on `N`'s
  right, so `N -> E` yields to `W -> N` by §20(2).
- `"main-end"` (A4 303 „Značka informuje o ukončení hlavnej cesty"; P 9
  „informuje o tom, že na najbližšej križovatke táto cesta už nie je hlavnou
  cestou") on an arm means the next intersection is an equal-roads one for
  that arm unless a yield/stop follows. The 2009 regulation forbade placing
  P 9 together with P 1/P 2 (Čl. 19 (8): „Značku nemožno umiestniť v
  kombinácii so značkou č. P 1 alebo č. P 2."), so `"main-end"` alone
  implies the right-hand rule at that junction.
- Sign 136 „Križovatka" (2020) / P 4 (2009) explicitly announces an
  equal-roads junction: A2 136 „Značka upozorňuje na križovatku, kde nie je
  prednosť v jazde upravená dopravnými značkami a uplatňujú sa všeobecné
  pravidlá o prednosti v jazde."

Sign numbering, both regimes (engine key -> 2020 -> 2009):

| Engine key | 2020 regulation | 2009 regulation | Meaning (2020 text) |
| --- | --- | --- | --- |
| `yield` | A3 201 Daj prednosť v jazde! | P 1 | „ukladá vodičovi povinnosť dať prednosť v jazde" |
| `stop` | A3 202 Stoj, daj prednosť v jazde! | P 2 | „povinnosť zastaviť vozidlo a dať prednosť v jazde" |
| `main` | A4 302 Hlavná cesta | P 8 (in towns); P 5 / P 6 Križovatka s vedľajšou cestou (outside towns) | „označuje začiatok alebo priebeh hlavnej cesty"; A4 301 Križovatka s prednosťou v jazde „informuje o prednosti v jazde v najbližšej križovatke" replaces P 5/P 6 |
| `main-end` | A4 303 Koniec hlavnej cesty | P 9 | „informuje o ukončení hlavnej cesty" |
| `roundabout` | A3 213 Kruhový objazd | C 7 | „označuje kruhový objazd a prikazuje smer jazdy v smere vyznačenom šípkami na značke" |
| `mainRoad` panel | A5 510 Priebeh hlavnej cesty | P 13, P 14 Tvar križovatky; P 15 Tvar dvoch križovatiek (P 12 = equal roads, shape only) | „vyznačuje priebeh hlavnej cesty, ak hlavná cesta vedie cez križovatku inak ako priamo ... Hlavná cesta je vyznačená hrubšou čiarou." |
| `tramPlate` | A5 512 Priečna jazda električky (panel) | P 3 Daj prednosť v jazde električke! (a standalone sign) | „ukladá vodičovi povinnosť dať prednosť v jazde a zároveň dať prednosť v jazde električke" |
| (distance to STOP) | A5 511 Vzdialenosť k povinnému zastaveniu | E 3 | under a yield sign, gives the distance to the STOP sign |
| (no key) | A5 513 Priečna jazda cyklistov | - | yield also to cyclists riding parallel to the road, from both sides |

2009 text for the panels (Čl. 2 (11) of the annex): „Dodatkové tabuľky Tvar
križovatky (č. P 12 až P 14) a Tvar dvoch križovatiek (č. P 15) vyznačujú
skutočný geometrický tvar križovatky, pričom hlavná cesta je vyznačená čiarou
dvojnásobnej šírky ako čiara vyznačujúca vedľajšie cesty, okrem dodatkovej
tabuľky Tvar križovatky (č. P 12), ktorá vyznačuje len cesty rovnakého
významu. Cesta, po ktorej sa ku križovatke prichádza, je vyznačená čiarou
vychádzajúcou od spodného okraja dodatkovej tabuľky s tvarom križovatky v
smere jazdy vodiča."

Old signs stay valid with the meaning of their 2020 counterpart: 2020
regulation §30(1) „Dopravné značky a dopravné zariadenia umiestnené do 31.
marca 2020 ostávajú v platnosti s významom podľa im zodpovedajúcich dopravných
značiek a dopravných zariadení podľa tejto vyhlášky".

### R5. Equal roads: the right-hand rule

§20(2):
> „Ak prednosť v jazde nevyplýva z odseku 1, vodič je povinný dať prednosť v jazde vozidlu prichádzajúcemu sprava."

"Prichádzajúcemu sprava" is about where the other vehicle **comes from**,
not where it is going. For a vehicle arriving on `S`, the arm on its right
is `E`; on `N` it is `W`; on `E` it is `N`; on `W` it is `S`. A tram and a
bicycle are "vozidlo" (§2(2)(y)) and are ranked by this rule like any car.

Engine: for every conflicting pair on arms at 90 degrees, the one whose arm
is to the other's right goes first. Oncoming pairs (`S`/`N`, `E`/`W`) are
not "sprava" to each other; they are ranked by R6.

### R6. Turning: left turn yields to oncoming (and to trams both ways)

§19(4):
> „Vodič odbočujúci vľavo je povinný dať prednosť v jazde protiidúcim motorovým vozidlám, malým elektrickým vozidlám i nemotorovým vozidlám, električkám idúcim v oboch smeroch, vozidlám idúcim vo vyhradenom jazdnom pruhu po jeho ľavej strane a cyklistom idúcim súbežne s cestou. Vodič motorového vozidla, malého elektrického vozidla i nemotorového vozidla odbočujúci vpravo je povinný dať prednosť v jazde električke, ak je povolená jazda pozdĺž električky vľavo a vozidlu idúcemu vo vyhradenom jazdnom pruhu po jeho pravej strane."

§19(3), last sentence (two oncoming left-turners do not wait for each other):
> „Ak vodiči protiidúcich vozidiel odbočujú vľavo, vyhýbajú sa vľavo."

§19(6) (right turn vs cyclist going straight):
> „Vodič odbočujúci vpravo je povinný dať prednosť v jazde cyklistovi idúcemu rovno vrátane cyklistu idúceho súbežne s cestou; to neplatí pre vodiča električky. Pri odbočovaní doľava vodič motorového vozidla nesmie ohroziť cyklistu odbočujúceho vľavo."

§22(1) (U-turn = left turn, plus the intersection rules):
> „Pri otáčaní platí obdobne § 19; pri otáčaní na križovatke aj § 20."

§20(3) (a left-turner may wait inside the intersection):
> „Vodič nesmie vojsť na križovatku, ak mu situácia nedovoľuje pokračovať za križovatkou v jazde, takže by bol nútený zastaviť vozidlo na križovatke; to neplatí, ak vodič musí zastaviť vozidlo v križovatke z dôvodu umožnenia chodcom prejsť cez vozovku alebo pri odbočovaní doľava podľa § 19 ods. 4."

Engine:

- A left-turning (or U-turning) vehicle yields to the oncoming vehicle
  (straight or turning right) **of the same rank**. It does not lift R4: a
  main-road left-turner still goes before a side-road vehicle.
- Two oncoming left-turners are simultaneous.
- A left-turner yields to trams coming from **either** direction on the
  road it turns off, even to a tram coming from behind it (trams in the
  same direction that it must cross).
- A right-turner yields to a cyclist going straight beside it, and to a
  tram when overtaking the tram on the left is permitted on that road
  (`tramTracks` on the same road, tram on the driver's right).

### R7. Trams

Besides being an ordinary "vozidlo" for R4 and R5, trams have these
special rules:

- §19(5), a tram crossing the path of parallel traffic has priority:
  > „Električka, ktorá križuje smer jazdy vozidla idúceho po jej pravej alebo po jej ľavej strane a dáva znamenie o zmene smeru jazdy, má prednosť v jazde."
  Engine: a tram whose track leaves the road it shares with a car (tram
  turns, car goes straight or turns across the track) goes first, whether
  the car is on the tram's left or right.
- §19(4): every left-turner yields to trams in both directions (R6).
- §11(2), last sentence, when driving onto or across the tram track:
  > „Pritom vodič nesmie ohroziť ani obmedziť električku v jazde."
- Panel A5 512 (2020) / sign P 3 (2009): a yield or stop sign with the tram
  panel means yield to the main road **and** to the tram, even where the
  tram comes from the side road.
- §4a(5) and §4(4): the pedestrian-crossing duties of §4a do not bind the
  tram driver („Odseky 1 až 4 neplatia pre vodiča električky."); §53(1)
  „Chodec je povinný umožniť električke plynulý prejazd."
- The 2020 regulation's direction signs and no-entry signs do not apply to
  trams (A3 II.1 point 1: „Značky o smere jazdy neplatia pre električku a
  trolejbus."), which is why a tram may cross a "Prikázaný smer" arrow.

What a vehicle going straight must do about a tram, in engine terms:

1. Tram on the same road turning across the car's path -> tram first
   (§19(5)).
2. Tram on a crossing road that carries a yield/stop sign, car on the main
   road -> car first (§20(1)); unless the car's own sign has the tram panel.
3. Tram on a crossing road with equal priority -> right-hand rule (§20(2)):
   tram from the car's right goes first, tram from the car's left goes
   after the car. The act contains no general "tram always first" rule;
   see open question 2.
4. Car turning left, tram anywhere on the road the car leaves -> tram first
   (§19(4)).

### R8. Entering from a place that is not a road

§21(1):
> „Pri vchádzaní na cestu z pozemku ležiaceho vedľa cesty, areálu s obmedzeným prístupom, oploteného objektu, garáže, parkoviska, obratiska električiek, čerpacej stanice a podobných miest, z poľnej cesty, z lesnej cesty, z cestičky pre cyklistov, z obytnej zóny alebo z pešej zóny vodič je povinný dať prednosť v jazde vozidlu idúcemu po ceste."

Together with §2(2)(k) (such a junction is not an intersection) this means:
the vehicle with `"fromEntry": true` yields to **every** vehicle on the
road, from the left, from the right, or turning into the driveway; the
right-hand rule is not consulted. Its own direction does not matter. §4(2)(h)
adds that the driver may not endanger pedestrians on the pavement when
entering the road.

### R9. Pedestrians

§4a(1)-(2):
> „(1) Vodič je povinný umožniť bezpečný prechod cez vozovku chodcovi, ktorý vstúpil na priechod pre chodcov alebo sa naňho chystá vstúpiť.
> (2) Vodič je povinný približovať sa k priechodu pre chodcov primeranou rýchlosťou tak, aby bol schopný v prípade potreby pred ním zastaviť vozidlo a umožniť bezpečný prechod chodca podľa odseku 1."

§4a(3): white cane -> always stop. §4a(5): none of this binds a tram
driver.

§19(7) (turning across a pedestrian):
> „Vodič odbočujúci vpravo alebo vľavo je povinný umožniť bezpečný prechod cez vozovku chodcovi, ktorý vstúpil na cestu, na ktorú vodič odbočuje."

§53(1), §53(3) (pedestrian side): the pedestrian must not enter the road
in front of an emergency vehicle, must let a tram pass, and outside a
crossing „smú prechádzať cez vozovku mimo priechodu pre chodcov, len ak s
ohľadom na vzdialenosť a rýchlosť jazdy prichádzajúcich vozidiel nedonútia
ich vodičov na zmenu smeru alebo rýchlosti jazdy."

Engine: a `pedestrians` entry with `onCrossing: true` on arm `X` holds every
non-tram vehicle whose path enters or leaves by `X` (straight through the
crossing on its own arm, or turning into `X`). Trams are exempt. Pedestrians
are not ranked against each other or against R4/R5; they are a gate.

### R10. Roundabouts (see section 4)

### R11. Anything the law does not rank is a tie the generator must avoid (see section 7)

## 4. Roundabouts

**Current law (since 1 April 2020, amendment 393/2019 Z. z.)** - §20(5):
> „Ak je kruhový objazd označený dopravnou značkou „Kruhový objazd" spolu s dopravnou značkou „Daj prednosť v jazde!" alebo „Stoj, daj prednosť v jazde!", vodič v kruhovom objazde má prednosť."

The sign itself only fixes the direction: A3 213 „Značka označuje kruhový
objazd a prikazuje smer jazdy v smere vyznačenom šípkami na značke."

So:

- **Roundabout sign + yield/stop at the entry** (`roundabout-yield`,
  `roundabout-stop`): the vehicle in the ring goes first; the entering
  vehicle waits. STOP additionally requires a halt (§20(4)).
- **Roundabout sign only** (`roundabout`): §20(5) does not apply, the
  general rule §20(2) does. The entering vehicle arrives from the right of
  the circulating vehicle, so **the circulating vehicle yields to the
  entering one**.
- Exits are not junctions with priority signs; a vehicle leaving the ring
  and one entering at the same arm do not conflict (different lanes). A
  pedestrian crossing at an entry or exit is handled by R9.
- Indicators, §30(5): „Znamenie o zmene smeru jazdy vodič nedáva pri vjazde
  do kruhového objazdu. Pri jazde po kruhovom objazde vodič dáva znamenie o
  zmene smeru jazdy, ak z takej križovatky vychádza ..." - irrelevant to
  ranking but useful for rendering.

**Old law (1 February 2009 to 31 March 2020)** - §20(5) then read:
> „Vodič vchádzajúci do kruhového objazdu označeného príslušnou dopravnou značkou je povinný dodržať smer na kruhovom objazde vyznačený šípkami. Vodič vchádzajúci do kruhového objazdu má prednosť v jazde, ak dopravnou značkou nie je ustanovené inak."

and the 2009 regulation's C 7 „Kruhový objazd" said: „Vodič vchádzajúci do
kruhového objazdu má prednosť v jazde, ak nie je prednosť v jazde upravená
značkami." P 7 „Križovatka s kruhovým objazdom" was only an advance warning
(„upozorňuje vopred ako značka predbežná na kruhový objazd, ktorý je
označený značkou Kruhový objazd (č. C 7)").

**Difference between the regimes**: none in outcome. The old text gave the
entering vehicle an explicit priority; the new text drops that sentence and
lets the right-hand rule produce the same result. In both regimes the
question bank's convention holds: sign only -> entering car first
(scene `ds-07`); sign with yield -> ring first. The exam convention that the
yield sign is normally present in practice is not law; the engine must look
at the sign actually drawn.

## 5. Police signals (2020 regulation §22)

§22(1):
> „Cestnú premávku v križovatke riadi príslušník Policajného zboru (ďalej len „policajt") v rovnošate zmenou postoja a pokynmi rúk, pričom používa smerovku, ktorú drží v pravej ruke. Pokyny policajta znamenajú pre účastníkov cestnej premávky
> a) „Stoj" pre smer, ku ktorému stojí policajt čelom alebo chrbtom s upaženou rukou alebo upaženými rukami; policajt môže obe ruky pripažiť, ak na riadenie cestnej premávky stačí postoj,
> b) „Čakaj", ak má policajt zdvihnutú pravú ruku alebo predlaktie pravej ruky nahor; pre účastníkov cestnej premávky už sa nachádzajúcich v križovatke znamená tento pokyn „Opustite križovatku",
> c) „Voľno" pre smer, ku ktorému stojí policajt bokom s upaženou rukou alebo upaženými rukami; policajt môže obe ruky pripažiť, ak na riadenie cestnej premávky stačí postoj,
> d) „Stoj" pre vodiča prichádzajúceho smerom k chrbtu alebo k pravému boku policajta, ak má policajt pravú ruku predpaženú a ľavú ruku upaženú a „Voľno" pre vodiča prichádzajúceho smerom k ľavému boku policajta; vodič vozidla prichádzajúceho smerom k čelu policajta môže odbočiť vpravo a chodci smú prechádzať cez vozovku za chrbtom policajta."

§22(2): „Na význam pokynov „Stoj", „Čakaj" a „Voľno" sa vzťahuje § 15 ods.
2." - so "Voľno" means „vodič smie pokračovať v jazde pri dodržaní pravidiel
cestnej premávky" (§15(2)(c)) and "Čakaj" means prepare to go if you were
stopped, stop if you were free unless you cannot stop safely (§15(2)(b)).
§22(4): the same applies away from intersections and to other authorised
persons.

The 2009 regulation §12(1) had the same four positions with the words
"Stoj!", "Pozor!", "Voľno" and, for (d), „vodič vozidla prichádzajúceho
smerom k čelu policajta môže odbočovať len vpravo a chodci smú prechádzať
vozovku len za chrbtom policajta". Meanings are unchanged.

Engine table. `facing` = the arm the officer's chest points at. For an
officer facing `S`: chest arm `S`, back arm `N`, his **left** side is `E`,
his **right** side is `W` (facing south, your left hand points east). In
general: facing `N` -> left `W`, right `E`; facing `E` -> left `N`, right
`S`; facing `W` -> left `S`, right `N`.

| `pose` | Chest arm | Back arm | Officer's left arm | Officer's right arm |
| --- | --- | --- | --- | --- |
| `arms-sides` (or arms down) | Stoj | Stoj | Voľno, any direction | Voľno, any direction |
| `right-forward-left-side` | right turn only (into the officer's-left arm) | Stoj | Voľno, any direction | Stoj |
| `arm-raised` | Čakaj: nobody enters; vehicles already inside leave | same | same | same |

Pedestrians: with `arms-sides` they cross on the officer's chest/back
side (the roads that are stopped); with `right-forward-left-side` only
behind the officer's back (§22(1)(d)).

Among vehicles that both have "Voľno", R6 and R9 still apply
(§22(2) -> §15(2)(c) „pri dodržaní pravidiel cestnej premávky"): a
left-turner from the officer's left arm yields to the oncoming vehicle from
the officer's right arm; a right-turner from the chest arm in pose
`right-forward-left-side` merges into the officer's-left road and must not
obstruct the "Voľno" flow.

## 6. Traffic lights (2020 regulation §15, §16; annex 7; 2009 regulation §9)

§15(2):
> „a) signál červenej farby „Stoj"; vodič musí zastaviť pred križovatkou,
> b) signál žltej farby „Čakaj"; pri rozsvietení tohto signálu počas rozsvieteného signálu červenej farby sa vodič musí pripraviť na jazdu a pri rozsvietení samostatného signálu žltej farby vodič musí zastaviť pred križovatkou, pričom ak je pri rozsvietení tohto signálu už tak blízko, že nemôže zastaviť bezpečne, smie pokračovať v jazde,
> c) signál zelenej farby „Voľno"; vodič smie pokračovať v jazde pri dodržaní pravidiel cestnej premávky."

**Full green** = "Voľno" subject to all the ordinary rules. A left-turner
on full green yields to oncoming traffic and to trams both ways (§19(4)),
and to pedestrians on the crossing it turns into (§19(7), §4a). The 2009
regulation §9(3)(c) said the same explicitly: „signál s plným zeleným
svetlom „Voľno" znamená pre vodiča možnosť pokračovať v jazde, a ak dodrží
ustanovenia o odbočovaní ... možnosť odbočiť vpravo alebo vľavo ...; vodič je
pritom povinný dať prednosť chodcom prechádzajúcim vo voľnom smere po
priechode pre chodcov ...". Engine: green on arm `X` lets `X` go; between
two green arms (normally `X` and its opposite) apply R6 and R9.

**Directional signals (arrow-shaped, one per lane/direction)** - §15(3):
> „Ak sú vodorovnými značkami vyznačené jazdné pruhy pre rôzne smery jazdy alebo skupiny smerov jazdy, môže byť cestná premávka v križovatke riadená samostatnými svetelnými signálmi so symbolom šípky alebo v tvare šípky pre každý z vyznačených smerov jazdy alebo skupín smerov jazdy osobitne. Ak svieti signál červenej alebo žltej farby so symbolom šípky alebo šípok alebo ak svieti signál v tvare zelenej šípky alebo šípok, ich význam podľa odseku 2 platí len pre smer vyznačený šípkou alebo šípkami."

The 2009 regulation §9(3)(e) was explicit that such a turn is protected:
„ak zelená šípka smeruje vľavo alebo vpravo, neplatí pre odbočovanie § 19
ods. 4 zákona". The 2020 text no longer contains that sentence (open
question 3). The question bank was written against the 2009 wording, so the
engine should treat a **green arrow signal** as a protected turn: the
left-turner does not yield to oncoming traffic (the oncoming direction has
red by design, §15(1) forbids green together with red except for the
supplementary arrow).

**Supplementary green arrow lit together with full red** (the small arrow
next to the main lamps; 2009 no. S 10) - §15(5):
> „Zasvietený doplnkový signál zelenej farby v tvare šípky alebo šípok umožňuje vodičovi pri dodržaní pravidiel cestnej premávky pokračovať v jazde v smere šípky alebo šípok aj vtedy, ak svieti signál červenej farby v tvare plného kruhu."

Transitional §30a(b) (until 31 March 2029):
> „zasvietený doplnkový signál zelenej farby v tvare šípky alebo šípok znamená pre vodiča možnosť pri dodržaní pravidiel cestnej premávky pokračovať v jazde v smere šípky alebo šípok aj vtedy, ak svieti signál červenej alebo žltej farby v tvare plného kruhu, pritom musí dať prednosť v jazde vozidlám idúcim vo voľnom smere."

The 2009 regulation §9(3)(g) said the same for S 10: „vodič je povinný dať
prednosť v jazde vozidlám idúcim vo voľnom smere, ako aj prednosť chodcom
prechádzajúcim vo voľnom smere po priechode pre chodcov a cyklistom ...; na
tento účel je povinný zastaviť vozidlo." Engine: a vehicle on a
red-plus-supplementary-arrow arm may go in the arrow direction but ranks
**after** every vehicle in the free (green) direction and after pedestrians.

**Green left arrow in the opposite corner - the "signal for leaving the
intersection"** (`exitArrows`) - §15(6):
> „Zasvietený doplnkový signál zelenej farby v tvare šípky doľava umiestnený v protiľahlom rohu križovatky znamená, že premávka protiidúcich vozidiel je zastavená signálom červenej farby v tvare plného kruhu a vodič môže odbočiť vľavo."

This is the 2020 equivalent of the 2009 regulation's S 4 "signál pre
opustenie križovatky", §9(3)(c): „ak svieti signál pre opustenie križovatky
(č. S 4) umiestnený v protiľahlom rohu križovatky, neplatí pre odbočovanie
vľavo alebo vpravo § 19 ods. 4 zákona". Engine: a left-turner on arm `X`
with `exitArrows[X] === "left"` does **not** yield to oncoming vehicles
(they have red); it still respects R9 (pedestrians) and R1.

**Yellow pedestrian/cyclist lamp next to a green arrow** - §16(1):
> „Zasvietený signál žltej farby v tvare chodca, bicykla alebo chodca a bicykla, ktorým je doplnený signál zelenej farby v tvare šípky alebo šípok, upozorňuje vodiča, že pri odbočení vpravo alebo vľavo križuje smer chôdze chodcov alebo smer jazdy cyklistov prechádzajúcich vo voľnom smere."

**"Zelená šípka" plate (right turn on red)** - annex 7, no. 730:
> „Zelená šípka umožňuje vodičovi po zastavení pred križovatkou odbočiť vpravo aj vtedy, ak svieti signál červenej farby. Vodič smie odbočiť doprava len z pravého pruhu a nesmie pri prejazde križovatkou obmedziť ani ohroziť iných účastníkov cestnej premávky, najmä chodcov, cyklistov a vozidlá jazdiace vo voľnom smere."

**"Čierna šípka" plate (U-turn on green)** - annex 7, no. 731: „Čierna
šípka umožňuje vodičovi otočiť sa v križovatke s riadenou premávkou, ak
svieti signál zelenej farby. Vodič pritom nesmie ohroziť ani obmedziť iných
účastníkov cestnej premávky ...".

**Flashing yellow** - §19(1): „Signál s prerušovaným svetlom žltej farby
upozorňuje účastníka cestnej premávky na nebezpečenstvo alebo na inú
neočakávanú situáciu na ceste, keď je potrebné dbať na zvýšenú opatrnosť."
The 2009 regulation §9(3)(d) added the consequence the engine needs: „ak
svetlo tohto signálu svieti prerušovane, nejde o križovatku s premávkou
riadenou svetelnými signálmi" - the signs and general rules apply.

**STOP line** - annex 6, no. 604: „Značka vyznačuje miesto, kde je vodič
povinný zastaviť na príkaz značky Stoj, daj prednosť v jazde! alebo pred
križovatkou s riadenou premávkou."

**No reversing** in a controlled intersection, §22(5): „Vodič nesmie cúvať v
križovatke s riadenou premávkou."

Engine summary for `control.type === "lights"`:

1. Arms with `red` do not go (except a supplementary arrow or the Zelená
   šípka plate, which rank after all green traffic and pedestrians).
2. Arms with `green` go; between them apply R6 (left yields to oncoming)
   unless the left-turner's arm has an `exitArrows` left arrow or its own
   green **arrow** signal, in which case the turn is protected.
3. R9 (pedestrians) and R1 (emergency) always apply.
4. Signs on the arms are ignored while the lights operate (§14).

## 7. Deadlock: what the law does not resolve

§20(2) is the only rule for equal roads and it is purely pairwise. The act
contains no tie-breaker for a closed cycle of yield duties and no "drivers
agree among themselves" clause (the only "dohodnúť" in the rules part is
§34 about towing). The classic case is four vehicles at a cross, each with a
vehicle on its right: every driver must yield and nobody may go.

Cycles are not limited to four vehicles going straight. Because R6 adds
edges (left-turner -> oncoming) to the graph built by R5 (left arm ->
right arm), three vehicles can lock: `S -> N` straight, `E -> W` straight,
`N -> E` left turn. `S` yields to `E` (right-hand), `E` yields to `N`
(right-hand), `N` yields to `S` (left turn vs oncoming): a cycle.

Generator rule: build a directed "must wait for" graph over conflicting
pairs using R4-R9, then reject any scene whose graph has a cycle, and
reject any scene whose topological order is not unique when the question
asks for a full order. The four-way all-straight case is one instance; the
check must be general.

## 8. Open questions (the text is ambiguous or silent)

1. **§20(2) vs §19(4) on the same pair.** A vehicle on `W` turning left to
   `S` and a vehicle on `E` going straight: `W` is on `E`'s right (§20(2)
   says `E` yields), while §19(4) says the left-turner `W` yields to
   oncoming `E`. The act does not say which sentence wins. The exam
   convention, and the reading used above, is that §19(4) governs oncoming
   pairs and §20(2) governs crossing pairs. Keep this as an explicit
   engine assumption.
2. **Tram at an equal intersection, coming from the car's left.** By
   §2(2)(y) and §20(2) the tram must yield; nothing in the act gives trams
   a blanket priority (only §19(4) and §19(5) do, for specific
   geometries). If an exam picture puts the tram first in that geometry,
   the answer key is applying a convention, not §20.
3. **Green arrow signal (§15(3)) under the 2020 regulation.** The
   sentence "§19 ods. 4 neplatí" from the 2009 regulation §9(3)(e) was not
   carried over. The protected-turn reading rests on §15(1) (green cannot
   show together with red for the same direction) and on the 2009 wording
   the question bank uses.
4. **Exit arrow (§15(6)) and pedestrians.** §15(6) only says oncoming
   traffic is stopped; it does not say whether the pedestrian crossing on
   the target arm is also red. Treat pedestrians as still protected by
   §19(7).
5. **Two vehicles both leaving non-roads** (two driveways facing each
   other): §21(1) makes each yield to "vozidlu idúcemu po ceste"; neither
   is on the road. Unranked; the generator should not produce it.
6. **Emergency vehicle drawn with blue lights only.** §2(2)(z) with (af)
   requires the sound signal too; a picture cannot show it. The engine
   reads `"siren": true` as "signal in use" (§40(9)); a blue light without
   the flag is an ordinary vehicle plus §40(11) caution.
7. **Straight main road when only one `main` sign is visible.** Assumed by
   convention (section 3, R4); the regulation only fixes where panel 510 is
   required („ak hlavná cesta vedie cez križovatku inak ako priamo alebo je
   jej priebeh ťažko rozoznateľný").
8. **Old sign P 3 "Daj prednosť v jazde električke!"** as a standalone
   sign has no 2020 counterpart other than the panel 512 under a yield or
   stop sign. §30(1) keeps old signs valid "s významom podľa im
   zodpovedajúcich" signs; for a standalone P 3 the corresponding 2020
   meaning is not stated.

## 9. Other priority rules in the act, not needed for intersection scenes

- §10(6): lane change yields to the vehicle in the target lane; where two
  lanes merge and neither is the through lane, „vodič jazdiaci v ľavom
  jazdnom pruhu je povinný dať prednosť v jazde vodičovi v pravom jazdnom
  pruhu" (zipper exception follows).
- §10(8), §35(2): merging from an acceleration lane / onto a motorway
  yields to through traffic.
- §12(3): a bus or trolleybus leaving a reserved lane gets priority from
  the adjacent lane.
- §18: oncoming vehicles pass on the right; „prednosť v jazde je povinný
  dať ten vodič, na ktorého strane jazdy je prekážka alebo zúžená vozovka";
  signs A3 203 / P 10 and A4 304 / P 11 fix this for narrow sections.
- §59a(4): on a "bicyklová cesta" cyclists have priority over admitted
  motor vehicles.
