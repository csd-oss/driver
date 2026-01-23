var vready=[];vready[1]='Prosím skontrolujte si dáta';vready[2]='Please verify your details';vready[3]='Kérjük, ellenőrizze adatait';
var vmeno=[];vmeno[1]='Meno';vmeno[2]='Name';vmeno[3]='Név';
var vpriezvisko=[];vpriezvisko[1]='Priezvisko';vpriezvisko[2]='Surename';vpriezvisko[3]='Vezetéknév';
var vnarodeny=[];vnarodeny[1]='Narodený';vnarodeny[2]='Born';vnarodeny[3]='Született';
var vstartbutton=[];vstartbutton[1]='Spustiť test';vstartbutton[2]='Run test';vstartbutton[3]='Futtassa a tesztet';
var vstartcancel=[];vstartcancel[1]='Zrušiť';vstartcancel[2]='Cancel';vstartcancel[3]='Megszünteti';
var vskupina=[];vskupina[1]='Skupina';vskupina[2]='Group';vskupina[3]='Csoport';

var bza=[];bza[1]='za';bza[2]='for';bza[3]='kérdés';


var vfinishconfirm=[];vfinishconfirm[1]='Neodpovedali ste na všetky otázky. Naozaj chcete ukončiť svoj test?';vfinishconfirm[2]='You havent answered all the questions. Are you sure you want to end your test?';vfinishconfirm[3]='Az összes kérdésre nem válaszoltál. Biztos benne, hogy be szeretné fejezni a tesztet?';
var vfinishconfirt=[];vfinishconfirt[1]='Čas na vykonanie teoretickej skúšky ešte neuplynul. Naozaj chcete ukončiť svoj test?';vfinishconfirt[2]='The time for the theoretical exam has not yet passed. Are you sure to end your test?';vfinishconfirt[3]='Az elméleti vizsga ideje még nem telt le. Biztos benne, hogy be szeretné fejezni a tesztet?';
var vfinishresulta=[];vfinishresulta[1]='Dosiahli ste ';vfinishresulta[2]='You have reached ';vfinishresulta[3]='Megszerzett pontok száma  ';
var vfinishresultb=[];vfinishresultb[1]='Úspešný test. ';vfinishresultb[2]='Successful test. ';vfinishresultb[3]='Sikeres teszt. ';
var vfinishresultc=[];vfinishresultc[1]='Neúspešný test. ';vfinishresultc[2]='Unsuccessful test. ';vfinishresultc[3]='Sikertelen teszt. ';

var vfinishbodya=[];vfinishbodya[1]='bod';vfinishbodya[2]='point';vfinishbodya[3]='pontért';
var vfinishbodyb=[];vfinishbodyb[1]='body';vfinishbodyb[2]='points';vfinishbodyb[3]='pontért';
var vfinishbodyc=[];vfinishbodyc[1]='bodov';vfinishbodyc[2]='points';vfinishbodyc[3]='pontért';
var vfinishbodyd=[];vfinishbodyd[1]=' z ';vfinishbodyd[2]=' of ';vfinishbodyd[3]=' tól ';
var vfinishbodye=[];vfinishbodye[1]=' zo ';vfinishbodye[2]=' of ';vfinishbodye[3]=' tól ';

var vfinishotazka=[];vfinishotazka[1]='Otázka č.';vfinishotazka[2]='Question nr.';vfinishotazka[3]='Kérdés szám ';
var vfinishzoba=[];vfinishzoba[1]='Zobrazenie otázky číslo č.';vfinishzoba[2]='Question nr.';vfinishzoba[3]='Kérdés szám ';
var vfinishzobb=[];vfinishzobb[1]='Otázka je chybná, pretože na túto otázku nebola zaregistrovaná žiadna odpoveď!';vfinishzobb[2]='The question is not valid because no answer has been registered for this question!';vfinishzobb[3]='A kérdés nem megfelelő, mert erre a kérdésre nem regisztráltak választ!';

var dialogHeader=[];dialogHeader[1]=['Rozhodnite'];dialogHeader[2]=['Decide'];dialogHeader[3]=['Dönt'];
var dialogYes=[];dialogYes[1]=['Áno'];dialogYes[2]=['Yes'];dialogYes[3]=['Igen'];
var dialogNo=[];dialogNo[1]=['Nie'];dialogNo[2]=['No'];dialogNo[3]=['Nem'];

var otherMsgWarning=[];otherMsgWarning[1]=['Upozornenie: '];otherMsgWarning[2]=['Warning: '];otherMsgWarning[3]=['Figyelem: '];
var otherMsgErr=[];otherMsgErr[1]=['Chyba: '];otherMsgErr[2]=['Error: '];otherMsgErr[3]=['Hiba: '];
var otherMsgNotResponding=[];otherMsgNotResponding[1]=['Server neodpovedá'];otherMsgNotResponding[2]=['Server is not responding'];otherMsgNotResponding[3]=['A szerver nem válaszol'];
var otherMsg1=[];otherMsg1[1]=['Zasielam odpoveď...'];otherMsg1[2]=['Sending...'];otherMsg1[3]=['Küldés...'];
var otherMsg2=[];otherMsg2[1]=['chyba pri odosielaní...'];otherMsg2[2]=['error sending...'];otherMsg2[3]=['hiba a küldéskor...'];
var otherMsg3=[];otherMsg3[1]=['Odpoveď'];otherMsg3[2]=['The answer'];otherMsg3[3]=['Válasz'];
var otherMsg4=[];otherMsg4[1]=['bola zaznamenaná...'];otherMsg4[2]=['was registered...'];otherMsg4[3]=['rögzítették...'];
var otherMsgReadText=[];otherMsgReadText[1]=['Načítavam test...'];otherMsgReadText[2]=['Loading test...'];otherMsgReadText[3]=['Teszt betöltése...'];
var otherMsgReadTextOK=[];otherMsgReadTextOK[1]=['Načítanie testu...OK'];otherMsgReadTextOK[2]=['Test load...OK'];otherMsgReadTextOK[3]=[ 'Teszt betöltése...OK'];
var otherMsgReadTextFail=[];otherMsgReadTextFail[1]=['Načítanie testu sa nepodarilo'];otherMsgReadTextFail[2]=['Loading test failed'];otherMsgReadTextFail[3]=['Nem sikerült betölteni a tesztet'];
var otherMsgReadNoTest=[];otherMsgReadNoTest[1]=['Užívateľ nemá vygenerovaný test, prosím obráťte sa na skúšobného komisára.'];otherMsgReadNoTest[2]=['There was not generated test for this user yet. Please contact commissar'];otherMsgReadNoTest[3]=['A felhasználónak nincs generált tesztje, kérjük lépjen kapcsolatba a vizsgáztatóval.'];
var otherMsgAnswerFail=[];otherMsgAnswerFail[1]=['Vaša odpoveď nebola zaregistrovaná'];otherMsgAnswerFail[2]=['Your answer has not been registered'];otherMsgAnswerFail[3]=['Válaszát nem regisztráltuk'];
var otherMsgWrongFormat=[];otherMsgWrongFormat[1]=['Nesprávny formát registračného čísla'];otherMsgWrongFormat[2]=['Incorrect registration number format'];otherMsgWrongFormat[3]=['Helytelen regisztrációs szám'];
var otherMsgWrongRC=[];otherMsgWrongRC[1]=['Nesprávny formát rodého čísla'];otherMsgWrongRC[2]=['Incorrect birth number format'];otherMsgWrongRC[3]=['Helytenlenül megadott születési szám'];
var otherMsgLoginUns=[];otherMsgLoginUns[1]=['Prihlásenie nebolo úspešné!'];otherMsgLoginUns[2]=['Login was not successful!'];otherMsgLoginUns[3]=['A bejelentkezés sikertelen!'];
var otherMsgLoginSuc=[];otherMsgLoginSuc[1]=['Prihlásenie OK'];otherMsgLoginSuc[2]=['Login successful'];otherMsgLoginSuc[3]=['Sikeres bejelentkezés'];
var otherMsgResultText=[];otherMsgResultText[1]=['Načítavam výsledok...'];otherMsgResultText[2]=['Loading the result...'];otherMsgResultText[3]=['Az eredmény betöltése'];
var otherMsgResultUns=[];otherMsgResultUns[1]=['Načítanie výsledku nebolo úspešné'];otherMsgResultUns[2]=['Loading the result was not successful'];otherMsgResultUns[3]=['Az eredmény betöltése sikertelen'];
var otherMsgResultSuc=[];otherMsgResultSuc[1]=['Načítanie výsledku OK...'];otherMsgResultSuc[2]=['Loading result OK...'];otherMsgResultSuc[3]=['Eredmény betöltése sikeres...'];
var otherMsgTimeout=[];otherMsgTimeout[1]=['Odpoveď sa nepodarilo odoslať. Skúste to znova, prípadne kontaktujte skúšobného komisára.'];otherMsgTimeout[2]=['The reply could not be sent. Try again, or contact the commissar.'];otherMsgTimeout[3]=['A választ nem sikerült elküldeni. Próbálja újra, vagy lépjen kapcsolatba a vizsgabiztossal.'];