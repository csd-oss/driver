//! PDF documents (genpdf over embedded DejaVu Sans, so Slovak diacritics render everywhere).
//!
//! What each document is, and where its content comes from:
//!
//! | Function | Document | Source |
//! |---|---|---|
//! | [`exam_application`] | Prihláška na skúšku z odbornej spôsobilosti | príloha č. 2 k vyhláške č. 9/2009 Z. z. (the school's form, text reproduced) |
//! | [`course_certificate`] | Potvrdenie o absolvovaní kurzu | the fields § 23 vyhlášky č. 45/2016 Z. z. prescribes for the osvedčenie; the official osvedčenie itself is issued in JISCD (§ 8 ods. 19), so this one says it is the school's confirmation |
//! | [`training_agreement`] | Zmluva o vykonaní vodičského kurzu | § 7 ods. 3 vyhlášky 45/2016 (what must be agreed before the course) |
//! | [`guardian_consent`] | Súhlas zákonného zástupcu + informácia o spracúvaní osobných údajov | § 2b ods. 3 písm. g) zákona 93/2005; GDPR čl. 13 |
//! | [`progress_report`] | Výpis z prípravy na skúšku | app progress synced to the school |
//! | [`attendance_sheet`] | Prezenčná listina výučby teórie | theory lessons + attendance |
//!
//! Every template is a starting point for the school's own wording; the legal texts are quoted,
//! the contract clauses are ours and should be read by a lawyer before a school signs them.

use crate::api::groups::{GroupRow, Lesson};
use crate::api::school::School;
use crate::api::students::{DrivingLesson, Enrolment, StudentRow};
use crate::readiness::Progress;
use genpdf::elements::{Break, FrameCellDecorator, PageBreak, Paragraph, TableLayout};
use genpdf::{Alignment, Document, Element, Margins, SimplePageDecorator, fonts, style};
use serde_json::Value;
use time::macros::format_description;
use time::{Date, OffsetDateTime};

pub struct StudentContext<'a> {
    pub school: &'a School,
    pub student: &'a StudentRow,
    pub enrolment: Option<&'a Enrolment>,
    pub group: Option<&'a GroupRow>,
    pub progress: &'a Progress,
    pub driving: &'a [DrivingLesson],
    pub fields: &'a Value,
    pub issued_by: &'a str,
}

pub struct GroupContext<'a> {
    pub school: &'a School,
    pub group: &'a GroupRow,
    pub students: &'a [StudentRow],
    pub lessons: &'a [Lesson],
    pub fields: &'a Value,
    pub issued_by: &'a str,
}

type PdfResult = anyhow::Result<Vec<u8>>;

fn family() -> anyhow::Result<fonts::FontFamily<fonts::FontData>> {
    let load = |bytes: &[u8]| fonts::FontData::new(bytes.to_vec(), None).map_err(|e| anyhow::anyhow!("font: {e}"));
    Ok(fonts::FontFamily {
        regular: load(include_bytes!("../assets/fonts/DejaVuSans.ttf"))?,
        bold: load(include_bytes!("../assets/fonts/DejaVuSans-Bold.ttf"))?,
        italic: load(include_bytes!("../assets/fonts/DejaVuSans-Oblique.ttf"))?,
        bold_italic: load(include_bytes!("../assets/fonts/DejaVuSans-BoldOblique.ttf"))?,
    })
}

fn document(title: &str) -> anyhow::Result<Document> {
    let mut doc = Document::new(family()?);
    doc.set_title(title);
    doc.set_minimal_conformance();
    doc.set_font_size(10);
    doc.set_line_spacing(1.3);
    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(Margins::trbl(18, 20, 18, 20));
    decorator.set_header(|page| {
        Paragraph::new(format!("Strana {page}"))
            .aligned(Alignment::Right)
            .styled(style::Style::new().with_font_size(7).with_color(style::Color::Greyscale(120)))
    });
    doc.set_page_decorator(decorator);
    Ok(doc)
}

fn render(doc: Document) -> PdfResult {
    let mut out = Vec::new();
    doc.render(&mut out).map_err(|e| anyhow::anyhow!("pdf: {e}"))?;
    Ok(out)
}

pub fn fmt_date(d: Date) -> String {
    d.format(format_description!("[day padding:none]. [month padding:none]. [year]")).unwrap_or_default()
}

fn fmt_opt_date(d: Option<Date>) -> String {
    d.map(fmt_date).unwrap_or_else(|| "____________".into())
}

fn fmt_instant(t: OffsetDateTime) -> String {
    fmt_date(t.date())
}

pub fn today() -> Date {
    OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc()).date()
}

fn or_blank(s: &str) -> String {
    if s.trim().is_empty() { "____________________".into() } else { s.to_owned() }
}

fn field<'a>(fields: &'a Value, key: &str) -> Option<&'a str> {
    fields.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty())
}

fn euro(cents: i32) -> String {
    let whole = cents / 100;
    let frac = (cents % 100).abs();
    let mut s = whole.to_string();
    // thousands separator: a thin space is what Slovak uses
    let mut grouped = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.push(' ');
        }
        grouped.push(c);
    }
    s = grouped.chars().rev().collect();
    format!("{s},{frac:02} €")
}

fn h1(text: &str) -> Paragraph {
    Paragraph::new(style::StyledString::new(text.to_owned(), style::Style::new().bold().with_font_size(15))).aligned(Alignment::Center)
}

fn h2(text: &str) -> Paragraph {
    Paragraph::new(style::StyledString::new(format!("\n{text}"), style::Style::new().bold().with_font_size(11)))
}

fn p(text: impl Into<String>) -> Paragraph {
    Paragraph::new(text.into())
}

fn small(text: impl Into<String>) -> Paragraph {
    Paragraph::new(style::StyledString::new(text.into(), style::Style::new().with_font_size(8).with_color(style::Color::Greyscale(90))))
}

fn signature_row(left: &str, right: &str) -> anyhow::Result<TableLayout> {
    let mut t = TableLayout::new(vec![1, 1]);
    t.row()
        .element(p(format!("\n\n.................................................\n{left}")).padded(Margins::trbl(6, 4, 0, 0)))
        .element(p(format!("\n\n.................................................\n{right}")).padded(Margins::trbl(6, 0, 0, 4)))
        .push()
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(t)
}

/// Two-column label/value table.
fn props(rows: &[(&str, String)]) -> anyhow::Result<TableLayout> {
    let mut t = TableLayout::new(vec![2, 5]);
    t.set_cell_decorator(FrameCellDecorator::new(true, true, false));
    for (label, value) in rows {
        t.row()
            .element(p(*label).styled(style::Style::new().with_color(style::Color::Greyscale(80))).padded(Margins::vh(1, 2)))
            .element(p(value.clone()).padded(Margins::vh(1, 2)))
            .push()
            .map_err(|e| anyhow::anyhow!("{e}"))?;
    }
    Ok(t)
}

fn school_header(doc: &mut Document, school: &School) {
    let name = if school.legal_name.is_empty() { &school.name } else { &school.legal_name };
    doc.push(p(name.clone()).styled(style::Style::new().bold().with_font_size(12)));
    let mut line = Vec::new();
    if !school.address.is_empty() {
        line.push(school.address.clone());
    }
    if !school.ico.is_empty() {
        line.push(format!("IČO {}", school.ico));
    }
    if !school.registration_no.is_empty() {
        line.push(format!("registrácia autoškoly č. {}", school.registration_no));
    }
    if !line.is_empty() {
        doc.push(small(line.join(" · ")));
    }
    let mut contact = Vec::new();
    if !school.phone.is_empty() {
        contact.push(school.phone.clone());
    }
    if !school.email.is_empty() {
        contact.push(school.email.clone());
    }
    if !contact.is_empty() {
        doc.push(small(contact.join(" · ")));
    }
    doc.push(Break::new(1.0));
}

fn student_name(s: &StudentRow) -> String {
    format!("{} {}", s.first_name, s.last_name)
}

fn is_minor_at(s: &StudentRow, on: Date) -> bool {
    match s.birth_date {
        Some(b) => {
            let eighteen = b.replace_year(b.year() + 18).unwrap_or(b);
            on < eighteen
        }
        None => false,
    }
}

// ---------------------------------------------------------------------------

/// Prihláška na skúšku z odbornej spôsobilosti (príloha č. 2 k vyhláške č. 9/2009 Z. z.): the
/// letter on page one, the list of applicants on page two, as the form lays them out.
/// `fields`: `place`, `date`, `authority` (the okresný dopravný inšpektorát addressed).
pub fn exam_application(ctx: &GroupContext) -> PdfResult {
    let mut doc = document("Prihláška na skúšku z odbornej spôsobilosti")?;
    let s = ctx.school;
    doc.push(small("Príloha č. 2 k vyhláške č. 9/2009 Z. z.").aligned(Alignment::Right));
    doc.push(Break::new(0.5));
    doc.push(h1("PRIHLÁŠKA NA SKÚŠKU Z ODBORNEJ SPÔSOBILOSTI"));
    doc.push(Break::new(1.0));

    let place = field(ctx.fields, "place").map(str::to_owned).unwrap_or_else(|| "...............................".into());
    let date = field(ctx.fields, "date").map(str::to_owned).unwrap_or_else(|| fmt_date(today()));
    let mut head = TableLayout::new(vec![1, 1]);
    let legal = if s.legal_name.is_empty() { s.name.clone() } else { s.legal_name.clone() };
    head.row()
        .element(
            p(format!("{legal}\n{}\n{}", s.address, if s.ico.is_empty() { String::new() } else { format!("IČO {}", s.ico) }))
                .styled(style::Style::new().bold()),
        )
        .element(p(format!("V {place} dňa {date}")).aligned(Alignment::Right))
        .push()
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    doc.push(head);
    doc.push(small("Obchodné meno a sídlo autoškoly (aj vo forme pečiatky)"));
    doc.push(Break::new(1.0));
    let authority = field(ctx.fields, "authority")
        .map(str::to_owned)
        .unwrap_or_else(|| "Okresné (krajské) riaditeľstvo PZ\nokresný (krajský) dopravný inšpektorát".into());
    doc.push(p(authority).styled(style::Style::new().bold()));
    doc.push(Break::new(1.0));
    doc.push(p("Vec:").styled(style::Style::new().bold()));
    doc.push(p("Prihláška žiadateľov o udelenie vodičského oprávnenia na skúšku z odbornej spôsobilosti – žiadosť o určenie termínu a miesta vykonania skúšky z odbornej spôsobilosti").styled(style::Style::new().bold()));
    doc.push(Break::new(0.6));
    doc.push(p("Podľa § 80 ods. 2 zákona č. 8/2009 Z. z. o cestnej premávke a o zmene a doplnení niektorých zákonov v znení neskorších predpisov prihlasujem žiadateľov o udelenie vodičského oprávnenia na skúšku z odbornej spôsobilosti a zároveň žiadam o určenie termínu a miesta vykonania skúšky."));
    doc.push(Break::new(0.4));
    doc.push(p("V prílohe prikladám žiadosť o udelenie vodičského oprávnenia každého z prihlásených žiadateľov podľa menného zoznamu žiadateľov o udelenie vodičského oprávnenia vrátane dokladov podľa § 15 vyhlášky Ministerstva vnútra Slovenskej republiky č. 9/2009 Z. z., ktorou sa vykonáva zákon o cestnej premávke a o zmene a doplnení niektorých zákonov v znení neskorších predpisov."));
    doc.push(Break::new(0.4));
    doc.push(p("Menný zoznam žiadateľov prihlásených na skúšku je uvedený na druhej strane listu tejto prihlášky."));
    doc.push(Break::new(0.4));
    doc.push(p("Čestne vyhlasujem, že zabezpečím oboznámenie prihlásených žiadateľov o vykonanie skúšky z odbornej spôsobilosti s určeným termínom a miestom vykonania skúšky bezodkladne a včas pred jej vykonaním."));
    doc.push(Break::new(1.5));
    doc.push(p("––––––––––––––––––––––––––––––––––––\nPodpis a pečiatka prevádzkovateľa autoškoly").aligned(Alignment::Right));
    doc.push(Break::new(1.0));
    doc.push(p("_____________________________________________________________________________"));
    doc.push(p("Orgán PZ v ............................... určuje termín vykonania"));
    doc.push(p("- teoretickej skúšky na deň, čas a miesto: ...................................................................................."));
    doc.push(p("- skúšky z vedenia motorových vozidiel na deň, čas a miesto: .................................................................."));
    doc.push(p("Za orgán PZ termín a miesto vykonania skúšky určil: ..................................................................."));
    doc.push(p("Termín a miesto vykonania skúšky vzal na vedomie prevádzkovateľ alebo ním poverený zástupca autoškoly dňa: ............................... Podpis a pečiatka: ..................................................."));

    doc.push(PageBreak::new());
    doc.push(p("Menný zoznam žiadateľov o udelenie vodičského oprávnenia prihlásených na skúšku z odbornej spôsobilosti")
        .aligned(Alignment::Center)
        .styled(style::Style::new().bold()));
    doc.push(Break::new(0.8));
    let mut t = TableLayout::new(vec![1, 5, 4, 7, 2, 3]);
    t.set_cell_decorator(FrameCellDecorator::new(true, true, true));
    let head_style = style::Style::new().bold().with_font_size(8);
    t.row()
        .element(p("P.č.").styled(head_style).padded(1))
        .element(p("Meno a priezvisko").styled(head_style).padded(1))
        .element(p("Rodné číslo").styled(head_style).padded(1))
        .element(p("Adresa pobytu").styled(head_style).padded(1))
        .element(p("Druh výcviku").styled(head_style).padded(1))
        .element(p("Poznámka").styled(head_style).padded(1))
        .push()
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    let cell = style::Style::new().with_font_size(8);
    for (i, st) in ctx.students.iter().enumerate() {
        let note = if st.needs_glasses { "okuliare" } else { "" };
        t.row()
            .element(p(format!("{}.", i + 1)).styled(cell).padded(1))
            .element(p(student_name(st)).styled(cell).padded(1))
            .element(p(if st.personal_id.is_empty() { fmt_opt_date(st.birth_date) } else { st.personal_id.clone() }).styled(cell).padded(1))
            .element(p(st.address.clone()).styled(cell).padded(1))
            .element(p(ctx.group.category.clone()).styled(cell).padded(1))
            .element(p(note).styled(cell).padded(1))
            .push()
            .map_err(|e| anyhow::anyhow!("{e}"))?;
    }
    for i in ctx.students.len()..14 {
        t.row()
            .element(p(format!("{}.", i + 1)).styled(cell).padded(1))
            .element(p(" ").padded(1))
            .element(p(" ").padded(1))
            .element(p(" ").padded(1))
            .element(p(" ").padded(1))
            .element(p(" ").padded(1))
            .push()
            .map_err(|e| anyhow::anyhow!("{e}"))?;
    }
    doc.push(t);
    doc.push(Break::new(1.0));
    doc.push(p("Žiadosti podľa zoznamu prihlásených žiadateľov o udelenie vodičského oprávnenia preveril dňa: ..............................."));
    doc.push(p("Podpis, odtlačok pečiatky skúšobného komisára: ........................................................................."));
    doc.push(Break::new(0.6));
    doc.push(p("Počet žiadateľov:"));
    doc.push(p(format!("1. prihlásených na skúšku: {}", ctx.students.len())));
    doc.push(p("2. nastúpených na vykonanie skúšky: ........................................................................................."));
    doc.push(p("3. ktorí zo skúšky odstúpili po príchode skúšobného komisára: .................................................."));
    doc.push(Break::new(0.6));
    doc.push(p("Žiadosť (žiadosti) o udelenie vodičského oprávnenia s predpísanými dokladmi vrátená (vrátené) prevádzkovateľovi alebo ním poverenému zástupcovi autoškoly pre neúplnosť a nesprávnosť vyplnenia; uvedie sa poradové číslo podľa menného zoznamu a dôvod:"));
    doc.push(p("......................................................................................................................................................."));
    doc.push(p("......................................................................................................................................................."));
    doc.push(Break::new(0.6));
    doc.push(p("Vrátenú žiadosť (vrátené žiadosti) o udelenie vodičského oprávnenia prevádzkovateľ alebo ním poverený zástupca autoškoly prevzal dňa: ........................................."));
    doc.push(p("Podpis a odtlačok pečiatky: .........................................................................................................."));
    doc.push(Break::new(1.0));
    doc.push(small(format!("Vygenerované z Driver pre autoškoly · kurz {} · {} · {}", ctx.group.name, ctx.issued_by, fmt_date(today()))));
    render(doc)
}

/// Potvrdenie o absolvovaní vodičského kurzu with the § 23 fields.
pub fn course_certificate(ctx: &StudentContext) -> PdfResult {
    let mut doc = document("Potvrdenie o absolvovaní kurzu")?;
    school_header(&mut doc, ctx.school);
    doc.push(h1("POTVRDENIE O ABSOLVOVANÍ VODIČSKÉHO KURZU"));
    doc.push(Break::new(1.2));
    let s = ctx.school;
    let st = ctx.student;
    let category = ctx.group.map(|g| g.category.clone()).unwrap_or_else(|| "B".into());
    let course_no = ctx.group.map(|g| g.jiscd_course_no.clone()).unwrap_or_default();
    let start = ctx.enrolment.map(|e| e.enrolled_on).or(ctx.group.and_then(|g| g.starts_on));
    let end = ctx.enrolment.and_then(|e| e.finished_on).or(ctx.group.and_then(|g| g.ends_on));
    let registration = format!(
        "registrácia autoškoly č. {}; živnostenské oprávnenie č. {}",
        or_blank(&s.registration_no),
        or_blank(&s.trade_licence_no)
    );
    doc.push(props(&[
        ("Prevádzkovateľ autoškoly", if s.legal_name.is_empty() { s.name.clone() } else { s.legal_name.clone() }),
        ("Registrácia a živnosť", registration),
        ("Druh kurzu", format!("vodičský kurz, skupina vodičského oprávnenia {category}{}", if course_no.is_empty() { String::new() } else { format!(" (kurz č. {course_no})") })),
        ("Začatie kurzu", fmt_opt_date(start)),
        ("Ukončenie kurzu", fmt_opt_date(end)),
        ("Účastník kurzu", student_name(st)),
        ("Poradové číslo v matričnej knihe", st.register_no.to_string()),
        ("Dátum a miesto narodenia", format!("{}, {}", fmt_opt_date(st.birth_date), or_blank(&st.birth_place))),
    ])?);
    doc.push(Break::new(1.0));
    let theory_req = ctx.group.map(|g| g.theory_lessons_required).unwrap_or(32);
    let driving_req = ctx.group.map(|g| g.driving_lessons_required).unwrap_or(39);
    let driving_done: i32 = ctx.driving.iter().filter(|d| d.kind != "PU").map(|d| d.lessons).sum();
    doc.push(p(format!(
        "Účastník kurzu absolvoval výučbu teórie a praktický výcvik podľa učebných osnov pre skupinu {category} \
         (predpísaný rozsah: {theory_req} vyučovacích hodín teórie, {driving_req} vyučovacích hodín praktického výcviku; \
         zaznamenaných jázd v tejto evidencii: {driving_done} vyučovacích hodín)."
    )));
    doc.push(Break::new(0.6));
    if let Some(d) = st.first_aid_ok_on {
        doc.push(p(format!("Kurz prvej pomoci a skúšku z poskytovania prvej pomoci absolvoval dňa {} (§ 6 ods. 3 zákona č. 93/2005 Z. z.).", fmt_date(d))));
    } else {
        doc.push(p("Doklad o absolvovaní kurzu prvej pomoci: ............................................ (§ 6 ods. 3 zákona č. 93/2005 Z. z.)."));
    }
    doc.push(Break::new(1.5));
    let place = field(ctx.fields, "place").map(str::to_owned).unwrap_or_else(|| "....................".into());
    doc.push(p(format!("V {place} dňa {}", fmt_date(today()))));
    doc.push(signature_row(
        "pečiatka autoškoly",
        &format!("{}\nprevádzkovateľ autoškoly / zodpovedný zástupca", or_blank(&s.responsible_person)),
    )?);
    doc.push(Break::new(2.0));
    doc.push(small("Osvedčenie o absolvovaní kurzu podľa § 23 vyhlášky č. 45/2016 Z. z. sa účastníkovi vydáva prostredníctvom cestného informačného systému (JISCD, § 8 ods. 19). Toto potvrdenie obsahuje tie isté údaje a slúži ako potvrdenie autoškoly pre účastníka kurzu, zamestnávateľa alebo školu."));
    render(doc)
}

/// Zmluva o vykonaní vodičského kurzu (§ 7 ods. 3 vyhlášky 45/2016: začatie, trvanie, štruktúra,
/// obsah, cena a ďalšie náležitosti sa dohodnú pred začatím kurzu). `fields`: `price_eur`,
/// `place`, `payment_terms`, `extra_lesson_eur`.
pub fn training_agreement(ctx: &StudentContext) -> PdfResult {
    let mut doc = document("Zmluva o vykonaní vodičského kurzu")?;
    school_header(&mut doc, ctx.school);
    doc.push(h1("ZMLUVA O VYKONANÍ VODIČSKÉHO KURZU"));
    doc.push(small("uzavretá podľa § 269 ods. 2 Obchodného zákonníka a § 7 ods. 3 vyhlášky č. 45/2016 Z. z.").aligned(Alignment::Center));
    doc.push(Break::new(1.0));
    let s = ctx.school;
    let st = ctx.student;
    let category = ctx.group.map(|g| g.category.clone()).unwrap_or_else(|| "B".into());
    let minor = is_minor_at(st, today());

    doc.push(h2("1. Zmluvné strany"));
    doc.push(props(&[
        ("Autoškola", format!("{}\n{}\nIČO {}, registrácia autoškoly č. {}, zastúpená: {}",
            if s.legal_name.is_empty() { s.name.clone() } else { s.legal_name.clone() },
            or_blank(&s.address), or_blank(&s.ico), or_blank(&s.registration_no), or_blank(&s.responsible_person))),
        ("Účastník kurzu", format!("{}\nnar. {} v {}\n{}\n{} · {}",
            student_name(st), fmt_opt_date(st.birth_date), or_blank(&st.birth_place), or_blank(&st.address),
            or_blank(&st.email), or_blank(&st.phone))),
    ])?);
    if minor {
        doc.push(Break::new(0.4));
        doc.push(props(&[("Zákonný zástupca", format!("{}\n{}", or_blank(&st.guardian_name), or_blank(&st.guardian_contact)))])?);
    }

    doc.push(h2("2. Predmet zmluvy"));
    let course_no = ctx.group.map(|g| g.jiscd_course_no.clone()).filter(|c| !c.is_empty());
    doc.push(p(format!(
        "Autoškola sa zaväzuje vykonať pre účastníka vodičský kurz na získanie vodičského oprávnenia skupiny {category}{} \
         podľa zákona č. 93/2005 Z. z. o autoškolách, vyhlášky č. 45/2016 Z. z. a platných učebných osnov. Účastník sa zaväzuje \
         zúčastniť sa výučby a výcviku a zaplatiť dohodnutú cenu.",
        course_no.map(|c| format!(" (kurz č. {c} v JISCD)")).unwrap_or_default()
    )));

    doc.push(h2("3. Začatie, trvanie, štruktúra a obsah kurzu"));
    let start = ctx.enrolment.map(|e| e.enrolled_on).or(ctx.group.and_then(|g| g.starts_on));
    let theory_req = ctx.group.map(|g| g.theory_lessons_required).unwrap_or(32);
    let driving_req = ctx.group.map(|g| g.driving_lessons_required).unwrap_or(39);
    doc.push(p(format!(
        "Kurz sa začína dňa {} a trvá najviac 12 mesiacov odo dňa začatia (§ 8 ods. 1 vyhlášky č. 45/2016 Z. z.). \
         Skladá sa z výučby teórie v rozsahu {theory_req} vyučovacích hodín (predpisy o cestnej premávke, náuka o vozidlách a ich údržba, \
         teória vedenia vozidla, zásady bezpečnej jazdy, opakovanie) a z praktického výcviku v rozsahu {driving_req} vyučovacích hodín \
         (trenažér, autocvičisko, cestná premávka, praktická údržba). Vyučovacia hodina trvá 45 minút. Účasť na výučbe a výcviku sa \
         zaznamenáva identifikačným zariadením do cestného informačného systému (JISCD).",
        fmt_opt_date(start)
    )));
    doc.push(p("Účastník absolvuje v autoškole najmenej 50 % predpísaných hodín teórie; zvyšok si nahradí individuálne alebo v elektronickej \
         podobe v JISCD (§ 8 ods. 6 a 8). Praktický výcvik v cestnej premávke sa začína po absolvovaní teórie vedenia vozidla a \
         najmenej polovice výučby predpisov (§ 8 ods. 15). Na prípravu na teoretickú skúšku autoškola odporúča aplikáciu Driver SK; \
         ak sa účastník rozhodne prepojiť aplikáciu s autoškolou, autoškola vidí jeho pokrok v príprave.".to_string()));

    doc.push(h2("4. Cena a platobné podmienky"));
    let price = ctx.enrolment.and_then(|e| e.price_cents).map(euro)
        .or_else(|| field(ctx.fields, "price_eur").map(|v| format!("{v} €")))
        .unwrap_or_else(|| "____________ €".into());
    let terms = field(ctx.fields, "payment_terms").map(str::to_owned).unwrap_or_else(|| {
        "Cena je splatná najneskôr pred začatím praktického výcviku v cestnej premávke, v hotovosti alebo prevodom na účet autoškoly.".into()
    });
    let extra = field(ctx.fields, "extra_lesson_eur").map(|v| format!(" Cena jednej vyučovacej hodiny kondičnej jazdy nad rámec kurzu je {v} €.")).unwrap_or_default();
    doc.push(p(format!("Cena kurzu je {price} vrátane DPH. {terms}{extra} V cene nie sú správne poplatky za skúšku a vydanie vodičského preukazu, lekárska prehliadka ani kurz prvej pomoci, ak ho autoškola nevykonáva.")));

    doc.push(h2("5. Povinnosti účastníka"));
    doc.push(p("Účastník pred zaradením do kurzu predloží doklad o zdravotnej spôsobilosti, doklad o vzdelaní podľa § 2b ods. 2 zákona (skupina B), a ak nedovŕšil 18 rokov, súhlas zákonného zástupcu. Počas výučby a výcviku má pri sebe doklad totožnosti, potvrdzuje svoju účasť identifikačným prvkom a dostaví sa na dohodnuté jazdy včas. Jazdu, ktorú nezruší najneskôr 24 hodín vopred, autoškola môže účtovať ako absolvovanú."));

    doc.push(h2("6. Ukončenie kurzu a skúška"));
    doc.push(p("Po absolvovaní výučby a výcviku v predpísanom rozsahu a po predložení dokladu o absolvovaní kurzu prvej pomoci vydá autoškola účastníkovi osvedčenie o absolvovaní kurzu (§ 6 ods. 1 písm. e) a ods. 3 zákona) a prihlási ho na skúšku z odbornej spôsobilosti. Účastník môže kurz predčasne ukončiť a pokračovať v inej autoškole; autoškola vykoná záznam o presune v JISCD (§ 8 ods. 10 vyhlášky)."));

    doc.push(h2("7. Osobné údaje"));
    doc.push(p("Autoškola spracúva osobné údaje účastníka na účely vykonania kurzu a plnenia povinností podľa zákona č. 93/2005 Z. z. a zákona č. 8/2009 Z. z. (vedenie dokumentácie kurzu v JISCD, prihlásenie na skúšku). Podrobnosti sú v informácii o spracúvaní osobných údajov, ktorú účastník dostal pri zaradení do kurzu."));

    doc.push(h2("8. Záverečné ustanovenia"));
    doc.push(p("Zmluva je vyhotovená v dvoch rovnopisoch, po jednom pre každú stranu. Zmeny sú možné len písomne. Zmluvné strany si zmluvu prečítali a na znak súhlasu ju podpisujú."));
    doc.push(Break::new(1.0));
    let place = field(ctx.fields, "place").map(str::to_owned).unwrap_or_else(|| "....................".into());
    doc.push(p(format!("V {place} dňa {}", fmt_date(today()))));
    doc.push(signature_row("za autoškolu", if minor { "účastník kurzu a zákonný zástupca" } else { "účastník kurzu" })?);
    doc.push(Break::new(1.5));
    doc.push(small("Vzor pripravený v Driver pre autoškoly. Pred použitím si znenie nechajte skontrolovať právnikom a doplňte vlastné obchodné podmienky."));
    render(doc)
}

/// Súhlas zákonného zástupcu so zaradením do kurzu (§ 2b ods. 3 písm. g) zákona 93/2005) and the
/// GDPR art. 13 notice, with the optional consent for sharing app practice data with the school.
pub fn guardian_consent(ctx: &StudentContext) -> PdfResult {
    let mut doc = document("Súhlas zákonného zástupcu a informácia o spracúvaní osobných údajov")?;
    school_header(&mut doc, ctx.school);
    let s = ctx.school;
    let st = ctx.student;
    let category = ctx.group.map(|g| g.category.clone()).unwrap_or_else(|| "B".into());
    let legal = if s.legal_name.is_empty() { s.name.clone() } else { s.legal_name.clone() };

    doc.push(h1("SÚHLAS ZÁKONNÉHO ZÁSTUPCU SO ZARADENÍM DO VODIČSKÉHO KURZU"));
    doc.push(small("§ 2b ods. 3 písm. g) zákona č. 93/2005 Z. z. o autoškolách").aligned(Alignment::Center));
    doc.push(Break::new(1.0));
    doc.push(p(format!(
        "Ja, dolupodpísaný(á) {}, {}, ako zákonný zástupca",
        or_blank(&st.guardian_name), or_blank(&st.guardian_contact)
    )));
    doc.push(p(format!(
        "{}, nar. {} v {}, bytom {},",
        student_name(st), fmt_opt_date(st.birth_date), or_blank(&st.birth_place), or_blank(&st.address)
    )).styled(style::Style::new().bold()));
    doc.push(p(format!(
        "súhlasím s jeho/jej zaradením do vodičského kurzu na získanie vodičského oprávnenia skupiny {category} v autoškole {legal} \
         a s uzavretím zmluvy o vykonaní vodičského kurzu. Beriem na vedomie, že žiadateľ mladší ako 18 rokov potrebuje môj súhlas aj \
         k žiadosti o udelenie vodičského oprávnenia (príloha č. 2b k vyhláške č. 9/2009 Z. z.)."
    )));
    doc.push(Break::new(0.8));
    doc.push(signature_row("dátum", "podpis zákonného zástupcu")?);

    doc.push(Break::new(1.5));
    doc.push(h1("INFORMÁCIA O SPRACÚVANÍ OSOBNÝCH ÚDAJOV"));
    doc.push(small("čl. 13 nariadenia (EÚ) 2016/679 (GDPR) a zákon č. 18/2018 Z. z.").aligned(Alignment::Center));
    doc.push(Break::new(0.6));
    doc.push(props(&[
        ("Prevádzkovateľ", format!("{legal}, {}, IČO {}, {}", or_blank(&s.address), or_blank(&s.ico), or_blank(&s.email))),
        ("Účel", "vykonanie vodičského kurzu a vedenie dokumentácie kurzu; prihlásenie na skúšku z odbornej spôsobilosti; fakturácia".into()),
        ("Právny základ", "čl. 6 ods. 1 písm. b) GDPR (zmluva o kurze); čl. 6 ods. 1 písm. c) GDPR (zákon č. 93/2005 Z. z. § 2b a § 6, vyhláška č. 45/2016 Z. z. § 16 až 21, zákon č. 8/2009 Z. z. § 77 až 80)".into()),
        ("Rozsah", "meno a priezvisko, dátum a miesto narodenia, rodné číslo, adresa pobytu, e-mail a telefón, údaje o zdravotnej a psychickej spôsobilosti (len výsledok), údaje o priebehu výučby a výcviku, údaje zákonného zástupcu".into()),
        ("Príjemcovia", "Ministerstvo dopravy SR – Jednotný informačný systém v cestnej doprave (JISCD); orgán Policajného zboru (dopravný inšpektorát) pri prihlásení na skúšku; poskytovateľ informačného systému autoškoly ako sprostredkovateľ".into()),
        ("Doba uchovávania", "počas kurzu a 5 rokov po jeho skončení (účtovné doklady 10 rokov); záznamy v JISCD podľa pravidiel jeho prevádzkovateľa".into()),
        ("Práva dotknutej osoby", "prístup k údajom, oprava, vymazanie, obmedzenie spracúvania, prenosnosť, námietka; sťažnosť na Úrad na ochranu osobných údajov SR, Hraničná 12, Bratislava".into()),
    ])?);
    doc.push(Break::new(0.8));
    doc.push(h2("Súhlas so zdieľaním pokroku v aplikácii Driver SK (dobrovoľný)"));
    doc.push(p("Účastník môže prepojiť aplikáciu Driver SK s autoškolou kódom. Autoškola potom vidí jeho pokrok v príprave na teoretickú skúšku (odpovede na testové otázky, výsledky skúšobných testov, skóre pripravenosti). Právnym základom je súhlas (čl. 6 ods. 1 písm. a) GDPR), ktorý možno kedykoľvek odvolať odpojením aplikácie v jej nastaveniach; odvolanie nemá vplyv na zákonnosť spracúvania pred ním. Bez tohto súhlasu sa kurz vykoná rovnako."));
    doc.push(Break::new(0.4));
    doc.push(p("☐  Súhlasím so zdieľaním pokroku v aplikácii s autoškolou.        ☐  Nesúhlasím."));
    doc.push(Break::new(0.8));
    doc.push(signature_row("dátum", if is_minor_at(st, today()) { "podpis účastníka a zákonného zástupcu" } else { "podpis účastníka" })?);
    doc.push(Break::new(1.5));
    doc.push(small("Vzor pripravený v Driver pre autoškoly. Doby uchovávania a zoznam sprostredkovateľov si upravte podľa vlastných záznamov o spracovateľských činnostiach."));
    render(doc)
}

/// Výpis z prípravy: what the app synced, in a page the student or a parent can take home.
pub fn progress_report(ctx: &StudentContext) -> PdfResult {
    let mut doc = document("Výpis z prípravy na skúšku")?;
    school_header(&mut doc, ctx.school);
    doc.push(h1("VÝPIS Z PRÍPRAVY NA TEORETICKÚ SKÚŠKU"));
    doc.push(Break::new(0.8));
    let st = ctx.student;
    let pr = ctx.progress;
    let label = match pr.label {
        "ready" => "pripravený(á) na skúšku",
        "almostReady" => "takmer pripravený(á)",
        "gettingThere" => "na dobrej ceste",
        _ => "potrebuje viac prípravy",
    };
    doc.push(props(&[
        ("Účastník kurzu", format!("{} (č. {})", student_name(st), st.register_no)),
        ("Kurz", ctx.group.map(|g| format!("{} · skupina {}", g.name, g.category)).unwrap_or_else(|| "–".into())),
        ("Vystavené", fmt_date(today())),
    ])?);
    doc.push(Break::new(0.8));
    if !pr.linked {
        doc.push(p("Aplikácia Driver SK zatiaľ nie je prepojená s autoškolou, takže o príprave na teoretickú skúšku nemáme údaje."));
    } else {
        doc.push(h2(&format!("Pripravenosť: {} / 100 · {label}", pr.score)));
        doc.push(props(&[
            ("Precvičené otázky", format!("{} z {} ({} %)", pr.seen_count, pr.total_questions, pr.components.coverage.round() as i64)),
            ("Otvorené chyby", format!("{} (z toho na zopakovanie dnes: {})", pr.mistakes_count, pr.due_mistakes_count)),
            ("Úspešnosť za 7 dní", pr.accuracy_7d.map(|a| format!("{a} % z {} odpovedí", pr.attempts_7d)).unwrap_or_else(|| "bez odpovedí v poslednom týždni".into())),
            ("Skúšobné testy", format!("{} absolvovaných, {} úspešných{}", pr.mocks_taken, pr.mocks_passed,
                pr.last_mock_score.map(|s| format!(", posledný {s} b.")).unwrap_or_default())),
            ("Odhad do pripravenosti", pr.days_to_ready.map(|d| if d == 0 { "pripravený(á)".to_owned() } else { format!("asi {d} dní pri súčasnom tempe") }).unwrap_or_else(|| "–".into())),
            ("Posledná aktivita", pr.last_activity_at.map(fmt_instant).unwrap_or_else(|| "–".into())),
        ])?);
        doc.push(Break::new(0.6));
        doc.push(small("Skóre pripravenosti skladá aplikácia zo štyroch častí: otvorené chyby (30 %), úspešnosť za posledných 7 dní (25 %), skúšobné testy (30 %) a podiel precvičených otázok (15 %). Za pripraveného sa považuje žiak so skóre 97 a viac."));
    }
    doc.push(Break::new(0.8));
    doc.push(h2("Jazdy"));
    let total: i32 = ctx.driving.iter().filter(|d| d.kind != "PU").map(|d| d.lessons).sum();
    let required = ctx.group.map(|g| g.driving_lessons_required).unwrap_or(39);
    doc.push(p(format!("Zaznamenaných {total} z {required} vyučovacích hodín praktického výcviku.")));
    if !ctx.driving.is_empty() {
        let mut t = TableLayout::new(vec![3, 2, 2, 2, 4, 5]);
        t.set_cell_decorator(FrameCellDecorator::new(true, true, true));
        let hs = style::Style::new().bold().with_font_size(8);
        let cs = style::Style::new().with_font_size(8);
        t.row()
            .element(p("Dátum").styled(hs).padded(1))
            .element(p("Druh").styled(hs).padded(1))
            .element(p("Hodiny").styled(hs).padded(1))
            .element(p("km").styled(hs).padded(1))
            .element(p("Inštruktor").styled(hs).padded(1))
            .element(p("Poznámka").styled(hs).padded(1))
            .push()
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        for d in ctx.driving.iter().take(12) {
            t.row()
                .element(p(fmt_date(d.held_on)).styled(cs).padded(1))
                .element(p(kind_name(&d.kind)).styled(cs).padded(1))
                .element(p(d.lessons.to_string()).styled(cs).padded(1))
                .element(p(d.km.map(|k| k.to_string()).unwrap_or_default()).styled(cs).padded(1))
                .element(p(d.instructor_name.clone().unwrap_or_default()).styled(cs).padded(1))
                .element(p(d.notes.clone()).styled(cs).padded(1))
                .push()
                .map_err(|e| anyhow::anyhow!("{e}"))?;
        }
        doc.push(t);
    }
    doc.push(Break::new(1.5));
    doc.push(small(format!("Vystavil(a) {} · Driver pre autoškoly", ctx.issued_by)));
    render(doc)
}

fn kind_name(kind: &str) -> &'static str {
    match kind {
        "AT" => "trenažér",
        "AC" => "autocvičisko",
        "CP" => "cestná premávka",
        _ => "údržba",
    }
}

/// Prezenčná listina: lessons down the side, students across, a mark where present. The
/// electronic triedna kniha lives in JISCD; this is the paper the school keeps for itself.
pub fn attendance_sheet(ctx: &GroupContext) -> PdfResult {
    let mut doc = document("Prezenčná listina výučby teórie")?;
    school_header(&mut doc, ctx.school);
    doc.push(h1("PREZENČNÁ LISTINA VÝUČBY TEÓRIE"));
    doc.push(small(format!("kurz {} · skupina {} · {} vyučovacích hodín predpísaných", ctx.group.name, ctx.group.category, ctx.group.theory_lessons_required)).aligned(Alignment::Center));
    doc.push(Break::new(0.8));
    let held: i32 = ctx.lessons.iter().map(|l| l.lessons).sum();
    let mut weights = vec![6usize, 2];
    weights.extend(ctx.lessons.iter().map(|_| 1usize));
    weights.push(2);
    let mut t = TableLayout::new(weights);
    t.set_cell_decorator(FrameCellDecorator::new(true, true, true));
    let hs = style::Style::new().bold().with_font_size(7);
    let cs = style::Style::new().with_font_size(8);
    let mut head = t.row().element(p("Účastník").styled(hs).padded(1)).element(p("Č.").styled(hs).padded(1));
    for l in ctx.lessons {
        head = head.element(p(format!("{}\n{}\n{}h", l.held_on.format(format_description!("[day].[month]")).unwrap_or_default(), l.subject, l.lessons)).styled(hs).padded(1));
    }
    head.element(p("Spolu").styled(hs).padded(1)).push().map_err(|e| anyhow::anyhow!("{e}"))?;
    for s in ctx.students {
        let mut row = t.row().element(p(student_name(s)).styled(cs).padded(1)).element(p(s.register_no.to_string()).styled(cs).padded(1));
        let mut present = 0;
        for l in ctx.lessons {
            let here = l.present_ids.contains(&s.id);
            if here {
                present += l.lessons;
            }
            row = row.element(p(if here { "✓" } else { "–" }).aligned(Alignment::Center).styled(cs).padded(1));
        }
        row.element(p(format!("{present}/{held}")).styled(cs).padded(1)).push().map_err(|e| anyhow::anyhow!("{e}"))?;
    }
    doc.push(t);
    doc.push(Break::new(1.0));
    doc.push(small("Predmety: PCP predpisy o cestnej premávke · NVU náuka o vozidlách a ich údržba · TVV teória vedenia vozidla · ZBJ zásady bezpečnej jazdy · OP opakovanie. Záväzná evidencia účasti je elektronická triedna kniha v JISCD (§ 18 vyhlášky č. 45/2016 Z. z.)."));
    doc.push(small(format!("Vystavil(a) {} · {}", ctx.issued_by, fmt_date(today()))));
    render(doc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_and_dates_format_the_slovak_way() {
        assert_eq!(euro(85000), "850,00 €");
        assert_eq!(euro(123456), "1 234,56 €");
        assert_eq!(fmt_date(Date::from_calendar_date(2026, time::Month::October, 3).unwrap()), "3. 10. 2026");
    }

    #[test]
    fn minors_are_detected_from_the_birth_date() {
        let mut s = sample_student();
        s.birth_date = Some(Date::from_calendar_date(2009, time::Month::January, 1).unwrap());
        assert!(is_minor_at(&s, Date::from_calendar_date(2026, time::Month::October, 17).unwrap()));
        assert!(!is_minor_at(&s, Date::from_calendar_date(2027, time::Month::January, 1).unwrap()));
    }

    pub(crate) fn sample_student() -> StudentRow {
        StudentRow {
            id: uuid::Uuid::nil(),
            register_no: 7,
            first_name: "Žofia".into(),
            last_name: "Ďurišová".into(),
            birth_date: Some(Date::from_calendar_date(2008, time::Month::May, 4).unwrap()),
            birth_place: "Žilina".into(),
            personal_id: "085504/1234".into(),
            address: "Hlinská 12, 010 01 Žilina".into(),
            email: "zofia@example.sk".into(),
            phone: "+421 900 000 000".into(),
            guardian_name: "Peter Ďuriš".into(),
            guardian_contact: "+421 900 111 111".into(),
            guardian_consent_on: None,
            medical_ok_on: None,
            psych_ok_on: None,
            education_doc_ok: true,
            first_aid_ok_on: None,
            needs_glasses: true,
            privacy_notice_on: None,
            app_consent_on: None,
            notes: String::new(),
            created_at: OffsetDateTime::now_utc(),
            group_id: None,
            group_name: None,
            enrolment_status: None,
        }
    }

    fn sample_school() -> School {
        School {
            id: uuid::Uuid::nil(),
            name: "Autoškola Demo".into(),
            legal_name: "Autoškola Demo s. r. o.".into(),
            ico: "12 345 678".into(),
            address: "Hlavná 1, 010 01 Žilina".into(),
            registration_no: "OU-ZA-OCDPK-2020/001".into(),
            trade_licence_no: "580-12345".into(),
            responsible_person: "Ing. Jana Nováková".into(),
            phone: "+421 41 000 000".into(),
            email: "info@demo.sk".into(),
        }
    }

    #[test]
    fn every_document_renders_a_pdf_with_diacritics() {
        let school = sample_school();
        let student = sample_student();
        let progress = crate::readiness::Progress::sample_for_tests(student.id);
        let ctx = StudentContext {
            school: &school,
            student: &student,
            enrolment: None,
            group: None,
            progress: &progress,
            driving: &[],
            fields: &serde_json::json!({ "place": "Žiline", "price_eur": "890" }),
            issued_by: "Test",
        };
        for pdf in [training_agreement(&ctx).unwrap(), course_certificate(&ctx).unwrap(), guardian_consent(&ctx).unwrap(), progress_report(&ctx).unwrap()] {
            assert!(pdf.starts_with(b"%PDF"), "not a pdf");
            assert!(pdf.len() > 10_000, "suspiciously small: {}", pdf.len());
        }
        let group = GroupRow {
            id: uuid::Uuid::nil(),
            name: "B-2026-10".into(),
            category: "B".into(),
            jiscd_course_no: "42".into(),
            branch_id: None,
            branch_name: None,
            starts_on: None,
            ends_on: None,
            exam_on: None,
            lead_instructor_id: None,
            lead_instructor_name: None,
            theory_lessons_required: 32,
            driving_lessons_required: 39,
            status: "running".into(),
            students_count: 1,
            theory_lessons_held: 0,
        };
        let gctx = GroupContext { school: &school, group: &group, students: std::slice::from_ref(&student), lessons: &[], fields: &serde_json::json!({}), issued_by: "Test" };
        assert!(exam_application(&gctx).unwrap().starts_with(b"%PDF"));
        assert!(attendance_sheet(&gctx).unwrap().starts_with(b"%PDF"));
    }
}
