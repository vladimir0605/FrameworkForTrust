// src/App.js
// Main component of application
import React, { useState, useEffect } from "react";
import MapComponent from "./Map";
import GCDWallet from "./GCDWallet";
import TestnetFaucet from "./TestnetFaucet";
import "./App.css";
import Globe from "./components/Globe";
import LogoImg from "./assets/logo/Logo_1.png";
import StatusBanner from "./StatusBanner";
import QuadrantMetaPanel from "./QuadrantMetaPanel";
import EventModerationPanel from "./EventModerationPanel";
import QuadrantInfoPanel from "./QuadrantInfoPanel";

// const API_BASE = http://10.198.3.166:8000; // as used for  /events (API_BASE)
const API_BASE = process.env.REACT_APP_API_BASE || "http://10.198.3.166:8000";

// 1) TRANSLATIONS
const translations = {
  en: {
    brand: "Framework for Trust",
    tagline: "A geospatial trust layer for the real world.",
    nav_project: "Project",
    nav_whitepaper: "Whitepaper",
    nav_dapp: "Map dApp",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "A global, geospatial registry of events, signals and correlations – secured by blockchain and open to everyone.",
    hero_cta_whitepaper: "Read whitepaper",
    hero_cta_dapp: "Open map dApp",

    section_project_title: "What is Framework for Trust?",
    section_project_text:
      "Framework for Trust is a decentralized geospatial infrastructure that attaches trustworthy data, events and reputation to locations on Earth. It links real-world signals to geospatial tokens and correlation metrics, enabling new ways to verify claims, assess risk and coordinate action.",

    section_whitepaper_title: "Whitepaper",
    section_whitepaper_intro:
      "The whitepaper explains the core concepts: geospatial quadrants, trust scores, correlation metrics, token economics and integration with existing systems.",
    section_whitepaper_button: "Download whitepaper (PDF)",

    section_video_title: "Intro video",
    section_video_text:
      "Watch a short introduction to the vision behind Framework for Trust.",

    section_dapp_title: "Map dApp",
    section_dapp_text:
      "Explore geospatial quadrants, on-chain events, trust scores and AI-similar events on the interactive map.",

    section_faq_title: "FAQ",
    faq_q1: "What is Framework for Trust, in one sentence?",
    faq_a1:
      "A system that assigns a measurable, verifiable trust level to geographic space — recorded on the blockchain so that no one can later change or dispute it.",
    faq_q2: "Why would space even need \"trust\"?",
    faq_a2:
      "Imagine a sensor, a drone, an IoT device, or even a human report claiming something about a specific location — that the terrain is stable, that a zone is safe, that the data from that place is reliable. Today, such claims are usually taken \"at face value.\" FfT instead builds a history: every location (a so-called geo-quadrant) accumulates evidence over time, and the system calculates how much it can be trusted based on that history. Reports from sensors, IoT devices and human sources from different origins are compared algorithmically and semantically, producing the most objective description of an event.",
    faq_q3: "How is this different from an ordinary database with ratings?",
    faq_a3:
      "A database can be quietly altered. Here, every event — a measurement, a report, a state change — is time-stamped and anchored on the blockchain (Polygon), so there's an immutable trail of who claimed what and when. This isn't a \"rating\" — it's provable history.",
    faq_q4: "Who calculates this trust level, and can it be trusted?",
    faq_a4:
      "The calculation combines two things: an on-chain balance (GCD) and semantic analysis of report content using a natural language processing model. The result isn't \"made up\" — every change in the score comes from recorded, verifiable events, not from the decision of a single person, business interest or server.",
    faq_q5: "What is GCD and how is it actually calculated?",
    faq_a5:
      "GCD (GeoChain Data) is a reputation token each contributor carries — it doesn't change based on whether conditions at a location are good or bad, but based on whether the contribution itself (a report, measurement, data point) is truthful. The system runs on a Proof-of-Contribution model: when a contribution is confirmed as credible, the contributor is rewarded with GCD tokens; when a contribution turns out to be fake, GCD is deducted (a penalty). Both rewards and penalties are executed as real on-chain transactions through smart contracts, so nothing can be manually adjusted — the balance is the sum of all previous, publicly verifiable decisions about who earned trust and who abused it. GCD isn't meant for speculation; it's the system's real economy with a clear purpose.",
    faq_q6: "What do \"semantic embeddings\" mean and what do they do in practice?",
    faq_a6:
      "When someone submits a report about a location (a text description, observation, measurement), the system converts that text into a numerical vector using a natural language processing model — in this case a multilingual model, since reports can arrive in different languages. That vector is stored in a Qdrant database, specialized for fast comparison of \"meaning similarity\" between records. In practice, this lets the system recognize whether a new report is consistent with earlier reports about the same location, or diverges from them — which affects how much that report is trusted. In other words, it's not just whether something was reported, but how well it fits the location's existing history. An anti-Sybil mechanism is also built into the system to prevent organized fake event entries and manipulation.",
    faq_q7: "What is a \"geo-quadrant\"?",
    faq_a7:
      "Space is divided into a grid of quadrants (similar to geohash systems). Each quadrant is a separate entity with its own history, its own trust score, and its own NFT identity on the blockchain.",
    faq_q8: "Why blockchain, and not just ordinary server infrastructure?",
    faq_a8:
      "Because the point is that no party — not even the system's own author — can rewrite history later. That matters especially when trust needs to serve as the basis for something more serious: insurance, logistics, science, resource management. A server can be shut down or altered; anchoring on the blockchain remains.",
    faq_q9:
      "Is this the same as the cryptocurrencies or NFT projects people usually talk about?",
    faq_a9:
      "Not in that sense. Blockchain is used here as infrastructure for immutably recording evidence, not as a speculative asset. An NFT component exists, but it represents a quadrant's identity, not a collectible.",
    faq_q10: "Who is behind the project?",
    faq_a10:
      "FfT is developed by a single developer, independently, from the smart contract architecture to the backend and frontend implementation. The project is currently being prepared for public code release.",
    faq_q11: "Is this a finished product or ongoing research?",
    faq_a11:
      "Both, at different layers. The core architecture (smart contracts, trust calculation, on-chain anchoring) works end-to-end on a test network. At the same time, open questions remain — such as provable model execution and resistance to post-quantum cryptography — which are still subjects of further research.",
    faq_q12: "Why should I care about this if I don't understand blockchain?",
    faq_a12:
      "Because the problem FfT solves isn't technical — it's trust: how do you know data about a place is true when no one can physically check every point on the planet? That's a question relevant to insurers, logistics, climate science, disaster management — in essence, relevant to everyone — and the solution being built here is one of the few attempts to solve it without relying on trust in a single institution.",
    faq_q13: "Where can I follow the project's development?",
    faq_a13:
      "The code will be publicly available on GitHub, and a technical document (whitepaper) will explain the architecture in detail for those who want a deeper understanding.",

    repo_section_title: "About Framework for Trust – repo",
    repo_section_p1:
      "Framework for Trust (FfT) is a geo-reputation layer for real-world events: each report is tied to a location (quadrant / subcell), a wallet and the reputation of the source. The system combines space, time and source reputation.",
    repo_section_p2:
      "is the system’s internal utility token. It is used as stake when submitting events and as a reward for high-quality contributions (Proof of Contribution). Higher stake + good reputation mean a higher trust_score.",
    repo_section_source_rep_label: "Source reputation",
    repo_section_p3:
      "combines the base assessment selected in the UI (slider), the on-chain GCD balance and the history of prior behaviour. Based on that, the system estimates how credible an individual event is.",
    repo_section_link: "🌐 Open Framework for Trust repo",

    footer_rights: "All rights reserved.",
  },

  sr: {
    brand: "Framework for Trust",
    tagline: "Geoprostorni sloj povjerenja za stvarni svijet.",
    nav_project: "Projekat",
    nav_whitepaper: "White paper",
    nav_dapp: "Mapa dApp",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "Globalni, geoprostorni registar događaja, signala i korelacija – zaštićen blockchain tehnologijom i otvoren za sve.",
    hero_cta_whitepaper: "Otvori white paper",
    hero_cta_dapp: "Otvori mapu dApp",

    section_project_title: "Šta je Framework for Trust?",
    section_project_text:
      "Framework for Trust je decentralizovana infrastruktura koja vezuje pouzdane podatke, događaje i reputaciju za lokacije na Zemlji. Povezuje signale iz stvarnog svijeta sa geolokacijskim tokenima i metričkim korelacijama, omogućavajući nove načine provjere tvrdnji, procjene rizika i koordinacije.",

    section_whitepaper_title: "White paper",
    section_whitepaper_intro:
      "White paper objašnjava ključne koncepte: geokvadrante, indekse povjerenja (trust_score), metričke korelacije, tokene i integraciju sa postojećim sistemima.",
    section_whitepaper_button: "Preuzmi white paper (PDF)",

    section_video_title: "Uvodni video",
    section_video_text:
      "Pogledaj kratki uvod u viziju Framework for Trust projekta.",

    section_dapp_title: "Mapa dApp",
    section_dapp_text:
      "Istraži geokvadrante, on-chain događaje, trust skorove i AI-slične događaje na interaktivnoj mapi.",

    section_faq_title: "FAQ",
    faq_q1: "Šta je Framework for Trust, jednom rečenicom?",
    faq_a1:
      "Sistem koji geografskom prostoru dodjeljuje mjerljiv, provjerljiv nivo povjerenja — zapisan na blockchainu tako da niko naknadno ne može da ga izmijeni ili ospori.",
    faq_q2: "Zašto bi prostor uopšte trebalo da ima \"povjerenje\"?",
    faq_a2:
      "Zamislite senzor, dron, IoT uređaj ili čak ljudski izvještaj koji tvrdi nešto o određenoj lokaciji — da je teren stabilan, da je zona bezbjedna, da su podaci sa tog mjesta pouzdani. Danas se ta tvrdnja obično uzima \"na riječ\". FfT umjesto toga gradi istoriju: svaka lokacija (tzv. geokvadrant) akumulira dokaze kroz vrijeme, a sistem izračunava koliko joj se, na osnovu te istorije, može vjerovati. Poklapanje izvještaja sa senzora, IoT uređaja i ljudskih izvještaja iz različitih izvora se algoritamski i semantički upoređuje i kao rezultat daje najobjektivniji opis događaja.",
    faq_q3: "Kako se to razlikuje od obične baze podataka sa ocjenama?",
    faq_a3:
      "Baza podataka se može tiho izmijeniti. Ovdje se svaki događaj — mjerenje, izvještaj, promjena stanja — vremenski markira i sidri na blockchainu (Polygon), tako da postoji nepromjenjiv trag ko je šta i kada tvrdio. To nije \"ocjena\" nego dokaziva istorija.",
    faq_q4: "Ko izračunava taj nivo povjerenja i da li se tome može vjerovati?",
    faq_a4:
      "Izračun kombinuje dvije stvari: on-chain bilans (GCD) i semantičku analizu sadržaja izvještaja pomoću modela za obradu prirodnog jezika. Rezultat se ne \"izmišlja\" — svaka promjena rezultata proizlazi iz zapisanih, provjerljivih događaja, a ne iz odluke jedne osobe, interesne politike ili servera.",
    faq_q5: "Šta je GCD i kako se konkretno izračunava?",
    faq_a5:
      "GCD (GeoChain Data) je token reputacije koji svaki kontributor nosi sa sobom — ne mijenja se zbog toga da li je stanje na nekoj lokaciji dobro ili loše, nego zbog toga da li je sam doprinos (izvještaj, mjerenje, podatak) istinit. Sistem radi po principu Proof-of-Contribution: kad se doprinos potvrdi kao vjerodostojan, kontributor se nagrađuje GCD tokenima; kad se ispostavi da je doprinos lažan, GCD mu se oduzima (kažnjava). I nagrada i kazna izvršavaju se kao stvarne on-chain transakcije preko smart ugovora, pa se ništa ne može ručno \"podesiti\" — bilans je zbir svih prethodnih, javno provjerljivih odluka o tome ko je zaslužio povjerenje, a ko ga je zloupotrijebio. GCD nije namijenjen za špekulacije već je realna ekonomija sistema i ima jasnu svrhu.",
    faq_q6: "Šta znače \"semantički embeddings\" i čemu služe u praksi?",
    faq_a6:
      "Kada neko podnese izvještaj o lokaciji (tekstualni opis, opažanje, mjerenje), sistem taj tekst pretvara u numerički vektor pomoću modela za obradu prirodnog jezika — u ovom slučaju višejezičnog modela, jer izvještaji mogu stizati na različitim jezicima. Taj vektor se čuva u Qdrant bazi, specijalizovanoj za brzo poređenje \"sličnosti značenja\" između zapisa. Operativno, to služi da sistem prepozna da li je novi izvještaj konzistentan sa ranijim izvještajima o istoj lokaciji, ili odstupa — što utiče na to koliko se tom izvještaju vjeruje. Drugim riječima, ne broji se samo da li je nešto prijavljeno, nego i koliko se to uklapa u dosadašnju istoriju te lokacije. U sistem je integrisan i anti-Sybil mehanizam da se spriječe organizovani lažni upisi događaja i manipulacije.",
    faq_q7: "Šta je \"geokvadrant\"?",
    faq_a7:
      "Prostor je podijeljen na mrežu kvadranata (slično geohash sistemima). Svaki kvadrant je zaseban entitet sa svojom istorijom, svojim rezultatom povjerenja i svojim NFT identitetom na blockchainu.",
    faq_q8: "Zašto blockchain, a ne samo obična server infrastruktura?",
    faq_a8:
      "Jer je poenta da nijedna strana — pa ni sam autor sistema — ne može naknadno prepisati istoriju. To je posebno bitno kad povjerenje treba da bude osnova za nešto ozbiljnije: osiguranje, logistiku, nauku, upravljanje resursima. Server se može ugasiti ili izmijeniti; anchoring na blockchainu ostaje.",
    faq_q9:
      "Da li je ovo isto što i kriptovalute ili NFT projekti o kojima se obično priča?",
    faq_a9:
      "Ne u tom smislu. Blockchain se ovdje koristi kao infrastruktura za nepromjenjivo bilježenje dokaza, a ne kao špekulativna imovina. NFT komponenta postoji, ali predstavlja identitet kvadranta, ne kolekcionarski predmet.",
    faq_q10: "Ko stoji iza projekta?",
    faq_a10:
      "FfT razvija jedan programer, samostalno, od arhitekture smart ugovora do backend i frontend implementacije. Projekat je u fazi pripreme za javno objavljivanje koda.",
    faq_q11: "Da li je ovo završen proizvod ili istraživanje u toku?",
    faq_a11:
      "Oboje, u različitim slojevima. Osnovna arhitektura (smart ugovori, izračun povjerenja, on-chain sidrenje) radi end-to-end na testnoj mreži. Istovremeno, otvorena su pitanja — poput dokazivog izvršavanja modela i otpornosti na post-kvantnu kriptografiju — koja ostaju predmet daljeg istraživanja.",
    faq_q12:
      "Zašto bih ja, kao neko ko ne razumije blockchain, trebalo da me ovo zanima?",
    faq_a12:
      "Zato što problem koji FfT rješava nije tehnički nego povjerenje: kako znati da su podaci o nekom mjestu istiniti, kada niko fizički ne može da provjeri svaku tačku na planeti. To je pitanje relevantno za osiguravajuće kuće, logistiku, nauku o klimi, upravljanje katastrofama, u osnovi je svima relevantno — a rješenje koje se ovdje gradi je jedan od malobrojnih pokušaja da se to riješi na način koji se ne oslanja na povjerenje u jednu instituciju.",
    faq_q13: "Gdje mogu pratiti razvoj projekta?",
    faq_a13:
      "Kod će biti javno dostupan na GitHub-u, a tehnički dokument (whitepaper) će detaljno objasniti arhitekturu za one koji žele dublje razumijevanje.",

    repo_section_title: "O Framework for Trust – repo",
    repo_section_p1:
      "Framework for Trust (FfT) je geo-reputacijski sloj za stvarne događaje: svaka prijava se vezuje za lokaciju (kvadrant / subcell), wallet i reputaciju izvora. Sistem kombinuje prostor, vrijeme i reputaciju izvora.",
    repo_section_p2:
      "je interni utility token sistema. Koristi se kao stake pri slanju događaja i kao nagrada za kvalitetne doprinose (Proof of Contribution). Veći stake + dobra reputacija znače veći trust_score.",
    repo_section_source_rep_label: "Reputacija izvora",
    repo_section_p3:
      "kombinuje osnovnu procjenu koju biraš u UI-ju (slider), on-chain GCD balans i istoriju ponašanja. Na osnovu toga sistem procjenjuje koliko je pojedinačan događaj vjerodostojan.",
    repo_section_link: "🌐 Otvori Framework for Trust repo",

    footer_rights: "Sva prava zadržana.",
  },

  fr: {
    brand: "Framework for Trust",
    tagline: "Une couche de confiance géospatiale pour le monde réel.",
    nav_project: "Projet",
    nav_whitepaper: "Livre blanc",
    nav_dapp: "dApp Carte",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "Un registre géospatial mondial des événements, signaux et corrélations – sécurisé par la blockchain et ouvert à tous.",
    hero_cta_whitepaper: "Lire le livre blanc",
    hero_cta_dapp: "Ouvrir la dApp Carte",

    section_project_title: "Qu'est-ce que Framework for Trust ?",
    section_project_text:
      "Framework for Trust est une infrastructure géospatiale décentralisée qui associe données fiables, événements et réputation à des lieux précis sur Terre. Elle relie les signaux du monde réel à des jetons géospatiaux et à des métriques de corrélation, ce qui permet de nouvelles formes de vérification, d’évaluation des risques et de coordination.",

    section_whitepaper_title: "Livre blanc",
    section_whitepaper_intro:
      "Le livre blanc décrit les concepts clés : quadrants géospatiaux, scores de confiance, métriques de corrélation, économie de jetons et intégration avec les systèmes existants.",
    section_whitepaper_button: "Télécharger le PDF",

    section_video_title: "Vidéo d'introduction",
    section_video_text:
      "Regardez une courte introduction à la vision derrière Framework for Trust.",

    section_dapp_title: "dApp Carte",
    section_dapp_text:
      "Explorez les quadrants géospatiaux, les événements on-chain, les scores de confiance et les événements similaires trouvés par l’IA sur la carte interactive.",

    section_faq_title: "FAQ",
    faq_q1: "Qu'est-ce que Framework for Trust, en une phrase ?",
    faq_a1:
      "Un système qui attribue à un espace géographique un niveau de confiance mesurable et vérifiable — enregistré sur la blockchain de sorte que personne ne puisse ensuite le modifier ou le contester.",
    faq_q2: "Pourquoi un espace aurait-il besoin de \"confiance\" ?",
    faq_a2:
      "Imaginez un capteur, un drone, un objet connecté (IoT), ou même un rapport humain affirmant quelque chose à propos d'un lieu précis — que le terrain est stable, qu'une zone est sûre, que les données provenant de cet endroit sont fiables. Aujourd'hui, ces affirmations sont généralement prises \"sur parole\". FfT construit au contraire un historique : chaque lieu (un « géoquadrant ») accumule des preuves au fil du temps, et le système calcule le niveau de confiance qu'on peut lui accorder sur cette base. Les rapports issus de capteurs, d'objets connectés et de sources humaines diverses sont comparés algorithmiquement et sémantiquement, pour produire la description la plus objective possible d'un événement.",
    faq_q3: "En quoi est-ce différent d'une simple base de données avec des notes ?",
    faq_a3:
      "Une base de données peut être modifiée discrètement. Ici, chaque événement — mesure, rapport, changement d'état — est horodaté et ancré sur la blockchain (Polygon), ce qui crée une trace immuable de qui a affirmé quoi et quand. Ce n'est pas une \"note\", c'est un historique prouvable.",
    faq_q4: "Qui calcule ce niveau de confiance, et peut-on lui faire confiance ?",
    faq_a4:
      "Le calcul combine deux éléments : un solde on-chain (GCD) et une analyse sémantique du contenu des rapports à l'aide d'un modèle de traitement du langage naturel. Le résultat n'est pas \"inventé\" — chaque variation du score découle d'événements enregistrés et vérifiables, et non de la décision d'une seule personne, d'un intérêt commercial ou d'un serveur.",
    faq_q5: "Qu'est-ce que le GCD et comment est-il calculé concrètement ?",
    faq_a5:
      "Le GCD (GeoChain Data) est un jeton de réputation que chaque contributeur porte avec lui — il ne varie pas selon que la situation d'un lieu est bonne ou mauvaise, mais selon que la contribution elle-même (rapport, mesure, donnée) est véridique. Le système fonctionne selon un modèle de Proof-of-Contribution : lorsqu'une contribution est confirmée comme crédible, le contributeur est récompensé en jetons GCD ; lorsqu'une contribution s'avère fausse, son GCD lui est retiré (sanction). Récompenses et sanctions s'exécutent sous forme de transactions on-chain réelles via des smart contracts, si bien que rien ne peut être ajusté manuellement — le solde est la somme de toutes les décisions publiques et vérifiables sur qui a mérité la confiance et qui en a abusé. Le GCD n'est pas destiné à la spéculation ; c'est l'économie réelle du système, avec un objectif clair.",
    faq_q6:
      "Que signifient les \"embeddings sémantiques\" et à quoi servent-ils concrètement ?",
    faq_a6:
      "Lorsqu'un rapport concernant un lieu est soumis (description textuelle, observation, mesure), le système convertit ce texte en un vecteur numérique à l'aide d'un modèle de traitement du langage naturel — ici un modèle multilingue, car les rapports peuvent arriver dans différentes langues. Ce vecteur est stocké dans une base Qdrant, spécialisée dans la comparaison rapide de \"similarité de sens\" entre enregistrements. En pratique, cela permet au système de détecter si un nouveau rapport est cohérent avec les rapports précédents sur le même lieu, ou s'en écarte — ce qui influence le niveau de confiance accordé à ce rapport. Autrement dit, ce n'est pas seulement le fait qu'un événement soit signalé qui compte, mais à quel point il s'inscrit dans l'historique du lieu. Un mécanisme anti-Sybil est également intégré pour empêcher les fausses déclarations organisées et les manipulations.",
    faq_q7: "Qu'est-ce qu'un \"géoquadrant\" ?",
    faq_a7:
      "L'espace est divisé en une grille de quadrants (semblable aux systèmes de geohash). Chaque quadrant est une entité distincte avec son propre historique, son propre score de confiance et sa propre identité NFT sur la blockchain.",
    faq_q8:
      "Pourquoi la blockchain, et pas simplement une infrastructure serveur classique ?",
    faq_a8:
      "Parce que l'idée est qu'aucune partie — pas même l'auteur du système — ne puisse réécrire l'historique par la suite. C'est particulièrement important lorsque la confiance doit servir de base à quelque chose de plus sérieux : assurance, logistique, science, gestion des ressources. Un serveur peut être arrêté ou modifié ; l'ancrage sur la blockchain, lui, subsiste.",
    faq_q9:
      "Est-ce la même chose que les cryptomonnaies ou les projets NFT dont on parle habituellement ?",
    faq_a9:
      "Pas dans ce sens-là. La blockchain est utilisée ici comme infrastructure pour enregistrer des preuves de manière immuable, et non comme un actif spéculatif. Une composante NFT existe, mais elle représente l'identité d'un quadrant, pas un objet de collection.",
    faq_q10: "Qui est derrière le projet ?",
    faq_a10:
      "FfT est développé par un seul développeur, de manière indépendante, de l'architecture des smart contracts jusqu'à l'implémentation backend et frontend. Le projet est actuellement en préparation pour la publication publique du code.",
    faq_q11: "S'agit-il d'un produit fini ou d'une recherche en cours ?",
    faq_a11:
      "Les deux, selon les couches. L'architecture centrale (smart contracts, calcul de confiance, ancrage on-chain) fonctionne de bout en bout sur un réseau de test. En parallèle, certaines questions restent ouvertes — comme l'exécution vérifiable des modèles ou la résistance à la cryptographie post-quantique — et font l'objet de recherches en cours.",
    faq_q12: "Pourquoi devrais-je m'y intéresser si je ne comprends pas la blockchain ?",
    faq_a12:
      "Parce que le problème que résout FfT n'est pas technique, mais lié à la confiance : comment savoir que les données concernant un lieu sont vraies, quand personne ne peut physiquement vérifier chaque point de la planète ? C'est une question pertinente pour les assureurs, la logistique, les sciences du climat, la gestion des catastrophes — en somme, pertinente pour tout le monde — et la solution développée ici est l'une des rares tentatives de la résoudre sans dépendre de la confiance envers une seule institution.",
    faq_q13: "Où puis-je suivre l'avancement du projet ?",
    faq_a13:
      "Le code sera disponible publiquement sur GitHub, et un document technique (whitepaper) expliquera l'architecture en détail pour ceux qui souhaitent aller plus loin.",

    repo_section_title: "À propos de Framework for Trust – dépôt",
    repo_section_p1:
      "Framework for Trust (FfT) est une couche de géo-réputation pour les événements du monde réel : chaque signalement est lié à un lieu (quadrant / subcell), à un wallet et à la réputation de la source. Le système combine l’espace, le temps et la réputation de la source.",
    repo_section_p2:
      "est le jeton utilitaire interne du système. Il est utilisé comme mise lors de la soumission d’événements et comme récompense pour les contributions de qualité (Proof of Contribution). Une mise plus élevée + une bonne réputation signifient un trust_score plus élevé.",
    repo_section_source_rep_label: "Réputation de la source",
    repo_section_p3:
      "combine l’évaluation de base sélectionnée dans l’interface (slider), le solde GCD on-chain et l’historique du comportement antérieur. Sur cette base, le système estime la crédibilité d’un événement individuel.",
    repo_section_link: "🌐 Ouvrir le dépôt Framework for Trust",

    footer_rights: "Tous droits réservés.",
  },

  ru: {
    brand: "Framework for Trust",
    tagline: "Геопространственный слой доверия для реального мира.",
    nav_project: "Проект",
    nav_whitepaper: "Whitepaper",
    nav_dapp: "Карта dApp",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "Глобальный геопространственный реестр событий, сигналов и корреляций — защищённый блокчейном и открытый для всех.",
    hero_cta_whitepaper: "Открыть whitepaper",
    hero_cta_dapp: "Открыть карту dApp",

    section_project_title: "Что такое Framework for Trust?",
    section_project_text:
      "Framework for Trust — это децентрализованная геопространственная инфраструктура, которая связывает надёжные данные, события и репутацию с конкретными точками на Земле. Она соединяет сигналы реального мира с геотокенами и корреляционными метриками, открывая новые способы проверки утверждений, оценки рисков и координации действий.",

    section_whitepaper_title: "Whitepaper",
    section_whitepaper_intro:
      "Whitepaper описывает ключевые концепции: геоквадранты, показатели доверия (trust_score), корреляционные метрики, токеномику и интеграцию с существующими системами.",
    section_whitepaper_button: "Скачать PDF",

    section_video_title: "Вводное видео",
    section_video_text:
      "Посмотрите короткое видео о видении, лежащем в основе Framework for Trust.",

    section_dapp_title: "Карта dApp",
    section_dapp_text:
      "Изучайте геоквадранты, on-chain события, показатели доверия и похожие события (AI) на интерактивной карте.",

    section_faq_title: "FAQ",
    faq_q1: "Что такое Framework for Trust одним предложением?",
    faq_a1:
      "Система, которая присваивает географическому пространству измеримый и проверяемый уровень доверия — записанный в блокчейне так, что никто впоследствии не может его изменить или оспорить.",
    faq_q2: "Зачем пространству вообще нужно \"доверие\"?",
    faq_a2:
      "Представьте датчик, дрон, IoT-устройство или даже сообщение человека, утверждающего что-то о конкретном месте — что местность устойчива, что зона безопасна, что данные оттуда достоверны. Сегодня такие утверждения обычно принимаются \"на слово\". FfT вместо этого выстраивает историю: каждое место (так называемый геоквадрант) со временем накапливает доказательства, и система вычисляет, насколько ему можно доверять на основе этой истории. Сообщения от датчиков, IoT-устройств и людей из разных источников сравниваются алгоритмически и семантически, давая наиболее объективное описание события.",
    faq_q3: "Чем это отличается от обычной базы данных с оценками?",
    faq_a3:
      "Базу данных можно незаметно изменить. Здесь каждое событие — измерение, отчёт, изменение состояния — фиксируется по времени и закрепляется в блокчейне (Polygon), создавая неизменяемый след того, кто и когда что утверждал. Это не \"оценка\", а доказуемая история.",
    faq_q4: "Кто вычисляет этот уровень доверия и можно ли ему доверять?",
    faq_a4:
      "Расчёт объединяет две вещи: on-chain баланс (GCD) и семантический анализ содержания отчётов с помощью модели обработки естественного языка. Результат не \"придумывается\" — каждое изменение показателя происходит из зафиксированных, проверяемых событий, а не из решения одного человека, чьих-то интересов или сервера.",
    faq_q5: "Что такое GCD и как он рассчитывается на практике?",
    faq_a5:
      "GCD (GeoChain Data) — это токен репутации, который несёт с собой каждый участник (контрибьютор) — он меняется не из-за того, хорошая или плохая ситуация в каком-то месте, а из-за того, правдив ли сам вклад (отчёт, измерение, данные). Система работает по модели Proof-of-Contribution: если вклад подтверждён как достоверный, участник вознаграждается токенами GCD; если вклад оказывается ложным, GCD у него списывается (штраф). И награда, и штраф исполняются как реальные on-chain транзакции через смарт-контракты, поэтому ничего нельзя вручную \"подкрутить\" — баланс представляет собой сумму всех предыдущих, публично проверяемых решений о том, кто заслужил доверие, а кто им злоупотребил. GCD не предназначен для спекуляций — это реальная экономика системы с чёткой целью.",
    faq_q6:
      "Что такое \"семантические эмбеддинги\" и для чего они нужны на практике?",
    faq_a6:
      "Когда кто-то подаёт отчёт о месте (текстовое описание, наблюдение, измерение), система преобразует этот текст в числовой вектор с помощью модели обработки естественного языка — в данном случае многоязычной, поскольку отчёты могут поступать на разных языках. Этот вектор хранится в базе Qdrant, специализированной на быстром сравнении \"смыслового сходства\" между записями. На практике это позволяет системе распознать, согласуется ли новый отчёт с предыдущими отчётами о том же месте, или расходится с ними — что влияет на степень доверия к этому отчёту. Иными словами, важно не только то, что о чём-то сообщили, но и то, насколько это вписывается в историю данного места. В систему также встроен анти-Sybil механизм, предотвращающий организованные фальшивые записи событий и манипуляции.",
    faq_q7: "Что такое \"геоквадрант\"?",
    faq_a7:
      "Пространство разделено на сетку квадрантов (по аналогии с системами geohash). Каждый квадрант — отдельная сущность со своей историей, своим показателем доверия и своей NFT-идентичностью в блокчейне.",
    faq_q8: "Почему блокчейн, а не обычная серверная инфраструктура?",
    faq_a8:
      "Потому что суть в том, что ни одна сторона — даже сам автор системы — не может впоследствии переписать историю. Это особенно важно, когда доверие должно служить основой для чего-то более серьёзного: страхования, логистики, науки, управления ресурсами. Сервер можно отключить или изменить; закрепление в блокчейне остаётся.",
    faq_q9:
      "Это то же самое, что криптовалюты или NFT-проекты, о которых обычно говорят?",
    faq_a9:
      "Нет, не в этом смысле. Блокчейн здесь используется как инфраструктура для неизменяемой фиксации доказательств, а не как спекулятивный актив. NFT-компонент существует, но представляет идентичность квадранта, а не коллекционный предмет.",
    faq_q10: "Кто стоит за проектом?",
    faq_a10:
      "FfT разрабатывает один программист, самостоятельно — от архитектуры смарт-контрактов до бэкенда и фронтенда. Проект сейчас готовится к публичному релизу кода.",
    faq_q11: "Это готовый продукт или исследование в процессе?",
    faq_a11:
      "И то, и другое, на разных уровнях. Базовая архитектура (смарт-контракты, расчёт доверия, on-chain закрепление) работает end-to-end в тестовой сети. При этом остаются открытые вопросы — например, доказуемое исполнение моделей и устойчивость к постквантовой криптографии — которые пока являются предметом дальнейших исследований.",
    faq_q12: "Почему мне, не разбирающемуся в блокчейне, стоит этим интересоваться?",
    faq_a12:
      "Потому что проблема, которую решает FfT, не техническая, а связана с доверием: как узнать, что данные о каком-то месте достоверны, если физически невозможно проверить каждую точку планеты? Это вопрос, актуальный для страховых компаний, логистики, климатической науки, управления катастрофами — по сути, актуальный для всех — а решение, которое здесь создаётся, одна из немногих попыток решить его, не полагаясь на доверие к единственному институту.",
    faq_q13: "Где можно следить за развитием проекта?",
    faq_a13:
      "Код будет публично доступен на GitHub, а технический документ (whitepaper) подробно объяснит архитектуру для тех, кто хочет разобраться глубже.",

    repo_section_title: "О Framework for Trust – репозиторий",
    repo_section_p1:
      "Framework for Trust (FfT) — это георепутационный слой для событий реального мира: каждое сообщение привязывается к местоположению (квадрант / subcell), кошельку и репутации источника. Система объединяет пространство, время и репутацию источника.",
    repo_section_p2:
      "— внутренний utility-токен системы. Он используется как stake при отправке событий и как награда за качественный вклад (Proof of Contribution). Более высокий stake + хорошая репутация означают более высокий trust_score.",
    repo_section_source_rep_label: "Репутация источника",
    repo_section_p3:
      "объединяет базовую оценку, выбранную в UI (slider), on-chain баланс GCD и историю предыдущего поведения. На этой основе система оценивает, насколько достоверно отдельное событие.",
    repo_section_link: "🌐 Открыть репозиторий Framework for Trust",

    footer_rights: "Все права защищены.",
  },

  de: {
    brand: "Framework for Trust",
    tagline: "Eine georäumliche Vertrauensschicht für die reale Welt.",
    nav_project: "Projekt",
    nav_whitepaper: "Whitepaper",
    nav_dapp: "Karten-dApp",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "Ein globales, georäumliches Register von Ereignissen, Signalen und Korrelationen – abgesichert durch Blockchain und offen für alle.",
    hero_cta_whitepaper: "Whitepaper lesen",
    hero_cta_dapp: "Karten-dApp öffnen",

    section_project_title: "Was ist Framework for Trust?",
    section_project_text:
      "Framework for Trust ist eine dezentrale georäumliche Infrastruktur, die vertrauenswürdige Daten, Ereignisse und Reputation mit Orten auf der Erde verknüpft. Sie verbindet reale Signale mit geoörtlichen Token und Korrelationsmetriken und ermöglicht so neue Wege, Behauptungen zu verifizieren, Risiken zu bewerten und Maßnahmen zu koordinieren.",

    section_whitepaper_title: "Whitepaper",
    section_whitepaper_intro:
      "Das Whitepaper erklärt die zentralen Konzepte: Geoquadranten, Vertrauensbewertungen (trust_score), Korrelationsmetriken, Token-Ökonomie und die Integration mit bestehenden Systemen.",
    section_whitepaper_button: "Whitepaper herunterladen (PDF)",

    section_video_title: "Einführungsvideo",
    section_video_text:
      "Sieh dir eine kurze Einführung in die Vision hinter Framework for Trust an.",

    section_dapp_title: "Karten-dApp",
    section_dapp_text:
      "Entdecke Geoquadranten, On-Chain-Ereignisse, Vertrauensbewertungen und KI-ähnliche Ereignisse auf der interaktiven Karte.",

    section_faq_title: "FAQ",
    faq_q1: "Was ist Framework for Trust, in einem Satz?",
    faq_a1:
      "Ein System, das geografischem Raum ein messbares, überprüfbares Vertrauensniveau zuweist — auf der Blockchain gespeichert, sodass es niemand nachträglich ändern oder bestreiten kann.",
    faq_q2: "Warum sollte Raum überhaupt \"Vertrauen\" brauchen?",
    faq_a2:
      "Stellen Sie sich einen Sensor, eine Drohne, ein IoT-Gerät oder sogar einen menschlichen Bericht vor, der etwas über einen bestimmten Ort behauptet — dass der Untergrund stabil ist, dass eine Zone sicher ist, dass die Daten von dort zuverlässig sind. Heute wird eine solche Behauptung meist einfach \"beim Wort genommen\". FfT baut stattdessen eine Historie auf: Jeder Ort (ein sogenannter Geoquadrant) sammelt im Laufe der Zeit Belege, und das System berechnet, wie sehr man ihm auf dieser Grundlage vertrauen kann. Berichte von Sensoren, IoT-Geräten und menschlichen Quellen aus verschiedenen Ursprüngen werden algorithmisch und semantisch verglichen und ergeben so die objektivste Beschreibung eines Ereignisses.",
    faq_q3: "Wie unterscheidet sich das von einer gewöhnlichen Bewertungsdatenbank?",
    faq_a3:
      "Eine Datenbank lässt sich unbemerkt ändern. Hier wird jedes Ereignis — eine Messung, ein Bericht, eine Zustandsänderung — zeitlich markiert und auf der Blockchain (Polygon) verankert, sodass eine unveränderliche Spur entsteht, wer wann was behauptet hat. Das ist keine \"Bewertung\", sondern eine beweisbare Geschichte.",
    faq_q4: "Wer berechnet dieses Vertrauensniveau, und kann man dem vertrauen?",
    faq_a4:
      "Die Berechnung kombiniert zwei Dinge: ein On-Chain-Guthaben (GCD) und eine semantische Analyse des Berichtsinhalts mithilfe eines Sprachmodells. Das Ergebnis wird nicht \"erfunden\" — jede Änderung des Werts ergibt sich aus erfassten, überprüfbaren Ereignissen, nicht aus der Entscheidung einer einzelnen Person, eines Interesses oder eines Servers.",
    faq_q5: "Was ist GCD und wie wird es konkret berechnet?",
    faq_a5:
      "GCD (GeoChain Data) ist ein Reputationstoken, das jeder Beitragende bei sich trägt — es ändert sich nicht danach, ob die Lage an einem Ort gut oder schlecht ist, sondern danach, ob der Beitrag selbst (Bericht, Messung, Datenpunkt) wahr ist. Das System arbeitet nach dem Proof-of-Contribution-Prinzip: Wird ein Beitrag als glaubwürdig bestätigt, wird der Beitragende mit GCD-Token belohnt; stellt sich ein Beitrag als gefälscht heraus, wird ihm GCD entzogen (Strafe). Belohnung und Strafe werden als echte On-Chain-Transaktionen über Smart Contracts ausgeführt, sodass nichts manuell \"angepasst\" werden kann — das Guthaben ist die Summe aller vorherigen, öffentlich überprüfbaren Entscheidungen darüber, wer Vertrauen verdient und wer es missbraucht hat. GCD ist nicht für Spekulation gedacht, sondern ist die reale Ökonomie des Systems mit klarem Zweck.",
    faq_q6:
      "Was bedeuten \"semantische Embeddings\" und wozu dienen sie in der Praxis?",
    faq_a6:
      "Wenn jemand einen Bericht über einen Ort einreicht (Textbeschreibung, Beobachtung, Messung), wandelt das System diesen Text mithilfe eines Sprachmodells — hier eines mehrsprachigen Modells, da Berichte in verschiedenen Sprachen eintreffen können — in einen numerischen Vektor um. Dieser Vektor wird in einer Qdrant-Datenbank gespeichert, die auf den schnellen Vergleich von \"Bedeutungsähnlichkeit\" zwischen Einträgen spezialisiert ist. In der Praxis erkennt das System dadurch, ob ein neuer Bericht mit früheren Berichten über denselben Ort übereinstimmt oder davon abweicht — was beeinflusst, wie sehr diesem Bericht vertraut wird. Es zählt also nicht nur, ob etwas gemeldet wurde, sondern wie gut es zur bisherigen Geschichte des Ortes passt. Ein Anti-Sybil-Mechanismus ist ebenfalls integriert, um organisierte gefälschte Einträge und Manipulationen zu verhindern.",
    faq_q7: "Was ist ein \"Geoquadrant\"?",
    faq_a7:
      "Der Raum ist in ein Raster von Quadranten unterteilt (ähnlich wie Geohash-Systeme). Jeder Quadrant ist eine eigenständige Einheit mit eigener Historie, eigenem Vertrauenswert und eigener NFT-Identität auf der Blockchain.",
    faq_q8: "Warum Blockchain und nicht einfach gewöhnliche Server-Infrastruktur?",
    faq_a8:
      "Weil der Sinn darin liegt, dass keine Partei — nicht einmal der Autor des Systems selbst — die Historie nachträglich umschreiben kann. Das ist besonders wichtig, wenn Vertrauen als Grundlage für etwas Ernsteres dienen soll: Versicherung, Logistik, Wissenschaft, Ressourcenmanagement. Ein Server kann abgeschaltet oder verändert werden; die Verankerung auf der Blockchain bleibt bestehen.",
    faq_q9:
      "Ist das dasselbe wie die Kryptowährungen oder NFT-Projekte, über die man normalerweise spricht?",
    faq_a9:
      "In diesem Sinne nicht. Blockchain wird hier als Infrastruktur zur unveränderlichen Aufzeichnung von Belegen genutzt, nicht als spekulatives Anlageobjekt. Eine NFT-Komponente existiert, repräsentiert aber die Identität eines Quadranten, kein Sammlerstück.",
    faq_q10: "Wer steht hinter dem Projekt?",
    faq_a10:
      "FfT wird von einem einzelnen Entwickler eigenständig entwickelt — von der Smart-Contract-Architektur bis zur Backend- und Frontend-Implementierung. Das Projekt befindet sich derzeit in Vorbereitung für die öffentliche Code-Veröffentlichung.",
    faq_q11: "Ist das ein fertiges Produkt oder laufende Forschung?",
    faq_a11:
      "Beides, auf unterschiedlichen Ebenen. Die Kernarchitektur (Smart Contracts, Vertrauensberechnung, On-Chain-Verankerung) funktioniert end-to-end in einem Testnetzwerk. Gleichzeitig bleiben offene Fragen bestehen — etwa beweisbare Modellausführung und Resistenz gegen Post-Quanten-Kryptografie —, die weiterhin Gegenstand der Forschung sind.",
    faq_q12: "Warum sollte mich das interessieren, wenn ich Blockchain nicht verstehe?",
    faq_a12:
      "Weil das Problem, das FfT löst, kein technisches ist, sondern eines des Vertrauens: Woher weiß man, dass Daten über einen Ort wahr sind, wenn niemand physisch jeden Punkt des Planeten überprüfen kann? Das ist eine Frage, die für Versicherer, Logistik, Klimawissenschaft, Katastrophenmanagement relevant ist — im Grunde für alle relevant — und die hier entwickelte Lösung ist einer der wenigen Versuche, das zu lösen, ohne sich auf das Vertrauen in eine einzelne Institution zu verlassen.",
    faq_q13: "Wo kann ich die Entwicklung des Projekts verfolgen?",
    faq_a13:
      "Der Code wird öffentlich auf GitHub verfügbar sein, und ein technisches Dokument (Whitepaper) wird die Architektur für alle, die ein tieferes Verständnis wollen, ausführlich erklären.",

    repo_section_title: "Über Framework for Trust – Repository",
    repo_section_p1:
      "Framework for Trust (FfT) ist eine Geo-Reputationsschicht für reale Ereignisse: Jede Meldung ist mit einem Ort (Quadrant / Subcell), einem Wallet und der Reputation der Quelle verknüpft. Das System kombiniert Raum, Zeit und Quellreputation.",
    repo_section_p2:
      "ist das interne Utility-Token des Systems. Es wird als Einsatz beim Melden von Ereignissen verwendet und als Belohnung für hochwertige Beiträge (Proof of Contribution). Höherer Einsatz und gute Reputation ergeben einen höheren trust_score.",
    repo_section_source_rep_label: "Quellreputation",
    repo_section_p3:
      "kombiniert die in der UI ausgewählte Basisbewertung (Slider), den On-Chain-GCD-Saldo und den Verlauf des bisherigen Verhaltens. Auf dieser Grundlage schätzt das System ein, wie glaubwürdig ein einzelnes Ereignis ist.",
    repo_section_link: "🌐 Framework for Trust Repository öffnen",

    footer_rights: "Alle Rechte vorbehalten.",
  },

  zh: {
    brand: "Framework for Trust",
    tagline: "面向真实世界的地理空间信任层。",
    nav_project: "项目",
    nav_whitepaper: "白皮书",
    nav_dapp: "地图 dApp",
    nav_faq: "常见问题",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "一个全球性的地理空间事件、信号与关联度注册系统，由区块链保障，并向所有人开放。",
    hero_cta_whitepaper: "阅读白皮书",
    hero_cta_dapp: "打开地图 dApp",

    section_project_title: "什么是 Framework for Trust？",
    section_project_text:
      "Framework for Trust 是一套去中心化的地理空间基础设施，把可信数据、事件和信誉绑定到地球上的具体位置。它将真实世界的信号与地理单元、相关性指标和代币联系起来，从而支持全新的声明验证、风险评估和协同方式。",

    section_whitepaper_title: "白皮书",
    section_whitepaper_intro:
      "白皮书介绍了核心概念：地理网格单元、信任评分、相关性指标、代币经济以及与现有系统的集成方式。",
    section_whitepaper_button: "下载 PDF",

    section_video_title: "介绍视频",
    section_video_text:
      "观看一段简短视频，了解 Framework for Trust 背后的愿景。",

    section_dapp_title: "地图 dApp",
    section_dapp_text:
      "在交互式地图上探索地理网格单元、链上事件、信任评分以及由 AI 找到的相似事件。",

    section_faq_title: "常见问题",
    faq_q1: "一句话说明什么是 Framework for Trust？",
    faq_a1:
      "一个为地理空间赋予可衡量、可验证信任等级的系统——记录在区块链上，任何人事后都无法更改或否认。",
    faq_q2: "为什么空间本身需要\"信任\"？",
    faq_a2:
      "想象一个传感器、无人机、物联网设备，甚至一份人工报告，声称某个地点的情况——地形稳定、区域安全、数据可靠。今天，这类说法通常只能\"照单全收\"。而 FfT 则构建历史记录：每个位置（所谓的地理网格单元）会随时间积累证据，系统根据这段历史计算该位置的可信程度。来自传感器、物联网设备和不同来源的人工报告会通过算法和语义方式进行比对，从而得出对事件最客观的描述。",
    faq_q3: "这和普通的评分数据库有什么区别？",
    faq_a3:
      "数据库可以被悄悄修改。而这里，每一个事件——测量、报告、状态变化——都会被打上时间戳并锚定在区块链（Polygon）上，形成谁在何时声明了什么的不可篡改记录。这不是\"评分\"，而是可证明的历史。",
    faq_q4: "谁来计算这个信任等级？它可信吗？",
    faq_a4:
      "计算结合了两部分：链上余额（GCD）和利用自然语言处理模型对报告内容进行的语义分析。结果不是\"凭空捏造\"的——每一次分数变化都源自已记录、可验证的事件，而不是某个人、某种利益或某台服务器的决定。",
    faq_q5: "GCD 到底是什么，具体如何计算？",
    faq_a5:
      "GCD（GeoChain Data）是每位贡献者所携带的信誉代币——它的变化并不取决于某个地点的状况是好是坏，而是取决于贡献本身（报告、测量、数据）是否真实。系统采用 Proof-of-Contribution（贡献证明）模型：当贡献被确认为可信时，贡献者会获得 GCD 代币奖励；当贡献被证实是虚假的，贡献者的 GCD 会被扣除（惩罚）。奖励和惩罚都通过智能合约以真实的链上交易执行，因此无法人为\"调整\"——余额是所有此前公开可验证决定的总和，记录了谁值得信任、谁滥用了信任。GCD 并非用于投机，而是系统真实经济体系的一部分，具有明确用途。",
    faq_q6: "\"语义嵌入（embeddings）\"是什么意思？在实践中有什么作用？",
    faq_a6:
      "当有人提交关于某地点的报告（文字描述、观察、测量）时，系统会利用自然语言处理模型——此处为多语言模型，因为报告可能以不同语言提交——将文本转换为数值向量。该向量存储在专门用于快速比较记录间\"语义相似度\"的 Qdrant 数据库中。实际作用是让系统识别一份新报告是否与该地点之前的报告一致，还是存在偏差——这会影响该报告的可信程度。换句话说，重要的不仅是是否上报了某事，还有它与该地点既有历史的契合程度。系统还内置了反 Sybil（女巫攻击）机制，以防止有组织的虚假上报和操纵行为。",
    faq_q7: "什么是\"地理网格单元\"？",
    faq_a7:
      "空间被划分为网格单元（类似 geohash 系统）。每个网格单元都是独立实体，拥有自己的历史记录、自己的信任评分，以及在区块链上属于自己的 NFT 身份。",
    faq_q8: "为什么用区块链，而不是普通的服务器基础设施？",
    faq_a8:
      "因为核心在于，任何一方——即便是系统的开发者本人——都无法在事后重写历史。当信任需要成为更重要事务（保险、物流、科学、资源管理）的基础时，这一点尤为关键。服务器可能被关闭或修改，而区块链上的锚定记录则始终存在。",
    faq_q9: "这和人们通常谈论的加密货币或 NFT 项目是一回事吗？",
    faq_a9:
      "并非那个意义上的一回事。这里的区块链被用作不可篡改地记录证据的基础设施，而不是投机性资产。系统确实有 NFT 组件，但它代表的是网格单元的身份，而非收藏品。",
    faq_q10: "这个项目背后是谁？",
    faq_a10:
      "FfT 由一位开发者独立开发——从智能合约架构到后端与前端实现均由其一人完成。项目目前正在为公开发布代码做准备。",
    faq_q11: "这是一个成品，还是仍在进行的研究？",
    faq_a11:
      "两者兼而有之，分处不同层面。核心架构（智能合约、信任计算、链上锚定）已在测试网络上实现端到端运行。与此同时，一些问题——例如可证明的模型执行和抗后量子密码学能力——仍是持续研究的课题。",
    faq_q12: "如果我不懂区块链，为什么还要关心这个？",
    faq_a12:
      "因为 FfT 解决的问题本质上不是技术问题，而是信任问题：当没有人能亲自核实地球上的每一个地点时，如何知道关于某地的数据是真实的？这个问题与保险公司、物流、气候科学、灾害管理密切相关——本质上与每个人都相关——而这里构建的方案，是少数几个不依赖对单一机构信任、尝试解决这一问题的努力之一。",
    faq_q13: "我在哪里可以关注项目的进展？",
    faq_a13:
      "代码将在 GitHub 上公开发布，技术文档（白皮书）将为希望深入了解的人详细解释系统架构。【链接将在发布时添加。】",

    repo_section_title: "关于 Framework for Trust – 仓库",
    repo_section_p1:
      "Framework for Trust (FfT) 是面向真实世界事件的地理空间信誉层：每条上报都绑定到一个位置（quadrant / subcell）、一个钱包以及来源信誉。系统结合了空间、时间和来源信誉。",
    repo_section_p2:
      "是系统内部的实用型代币。它在提交事件时用作 stake，也作为高质量贡献（Proof of Contribution）的奖励。更高的 stake + 良好的信誉意味着更高的 trust_score。",
    repo_section_source_rep_label: "来源信誉",
    repo_section_p3:
      "结合了在 UI 中选择的基础评估（slider）、链上的 GCD 余额以及过往行为历史。基于这些，系统会评估单个事件的可信度。",
    repo_section_link: "🌐 打开 Framework for Trust 仓库",

    footer_rights: "版权所有。",
  },

  ar: {
    brand: "Framework for Trust",
    tagline: "طبقة ثقة جغرافية للعالم الحقيقي.",
    nav_project: "المشروع",
    nav_whitepaper: "الورقة البيضاء",
    nav_dapp: "تطبيق الخريطة",
    nav_faq: "الأسئلة الشائعة",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "سجل جغرافي عالمي للأحداث والإشارات وعلاقات الارتباط، مؤمَّن بتقنية البلوكشين ومتاح للجميع.",
    hero_cta_whitepaper: "قراءة الورقة البيضاء",
    hero_cta_dapp: "فتح تطبيق الخريطة",

    section_project_title: "ما هو Framework for Trust؟",
    section_project_text:
      "Framework for Trust هو بنية تحتية جغرافية لامركزية تربط البيانات الموثوقة والأحداث والسمعة بالمواقع على كوكب الأرض. إنه يربط إشارات العالم الحقيقي بوحدات جغرافية وقياسات ارتباط وتوكنات، مما يفتح الباب أمام أساليب جديدة للتحقق من الادعاءات وتقييم المخاطر والتنسيق.",

    section_whitepaper_title: "الورقة البيضاء",
    section_whitepaper_intro:
      "تشرح الورقة البيضاء المفاهيم الأساسية: الوحدات الجغرافية، درجات الثقة، مقاييس الارتباط، اقتصاديات التوكنات والتكامل مع الأنظمة القائمة.",
    section_whitepaper_button: "تحميل PDF",

    section_video_title: "فيديو تعريفي",
    section_video_text:
      "شاهد مقدمة قصيرة عن الرؤية وراء Framework for Trust.",

    section_dapp_title: "تطبيق الخريطة",
    section_dapp_text:
      "استكشف الوحدات الجغرافية والأحداث على السلسلة ودرجات الثقة والأحداث المشابهة (المكتشفة بالذكاء الاصطناعي) على الخريطة التفاعلية.",

    section_faq_title: "الأسئلة الشائعة",
    faq_q1: "ما هو Framework for Trust في جملة واحدة؟",
    faq_a1:
      "نظام يمنح المساحة الجغرافية مستوى ثقة قابلاً للقياس والتحقق — مُسجَّلاً على البلوكشين بحيث لا يستطيع أحد تعديله أو الطعن فيه لاحقاً.",
    faq_q2: "لماذا قد يحتاج المكان أصلاً إلى \"ثقة\"؟",
    faq_a2:
      "تخيّل جهاز استشعار، أو طائرة مسيّرة، أو جهاز إنترنت الأشياء، أو حتى تقريراً بشرياً يدّعي شيئاً عن موقع معيّن — أن التضاريس مستقرة، أن المنطقة آمنة، أن البيانات القادمة من هناك موثوقة. اليوم، عادةً ما تُؤخذ هذه الادعاءات \"على عواهنها\". أما Framework for Trust فيبني بدلاً من ذلك سجلاً تاريخياً: كل موقع (يسمى geo-quadrant) يراكم الأدلة بمرور الوقت، ويحسب النظام مدى إمكانية الوثوق به استناداً إلى هذا السجل. تتم مقارنة التقارير الواردة من أجهزة الاستشعار وإنترنت الأشياء والمصادر البشرية المختلفة خوارزمياً ودلالياً، لتُنتج أكثر وصف موضوعي ممكن للحدث.",
    faq_q3: "كيف يختلف هذا عن قاعدة بيانات عادية بها تقييمات؟",
    faq_a3:
      "يمكن تعديل قاعدة البيانات بهدوء. أما هنا، فكل حدث — قياس، تقرير، تغيّر في الحالة — يُختم زمنياً ويُثبّت على البلوكشين (Polygon)، بحيث يبقى أثر لا يمكن تغييره لمن ادّعى ماذا ومتى. هذا ليس \"تقييماً\"، بل تاريخاً قابلاً للإثبات.",
    faq_q4: "من الذي يحسب مستوى الثقة هذا، وهل يمكن الوثوق به؟",
    faq_a4:
      "يجمع الحساب بين أمرين: رصيد على السلسلة (GCD) وتحليل دلالي لمحتوى التقارير باستخدام نموذج لمعالجة اللغة الطبيعية. النتيجة ليست \"مُختلَقة\" — فكل تغيير في النتيجة ينبع من أحداث مسجَّلة وقابلة للتحقق، وليس من قرار شخص واحد أو مصلحة معيّنة أو خادم.",
    faq_q5: "ما هو GCD وكيف يُحسب فعلياً؟",
    faq_a5:
      "GCD (GeoChain Data) هو رمز سمعة يحمله كل مساهِم — لا يتغيّر بناءً على ما إذا كانت أوضاع موقع ما جيدة أو سيئة، بل بناءً على ما إذا كانت المساهمة نفسها (تقرير، قياس، بيانات) صادقة. يعمل النظام وفق نموذج Proof-of-Contribution: عندما تُؤكَّد المساهمة كموثوقة، يُكافَأ المساهم برموز GCD؛ وعندما يتبيّن أن المساهمة مزيّفة، تُخصَم منه رموز GCD (عقوبة). تُنفَّذ كل من المكافأة والعقوبة كمعاملات فعلية على السلسلة عبر العقود الذكية، بحيث لا يمكن تعديل أي شيء يدوياً — فالرصيد هو مجموع كل القرارات السابقة القابلة للتحقق علناً حول من استحق الثقة ومن أساء استخدامها. لا يُقصد بـ GCD أن يكون أداة للمضاربة، بل هو الاقتصاد الحقيقي للنظام وله غرض واضح.",
    faq_q6:
      "ماذا تعني \"التضمينات الدلالية\" (semantic embeddings) وما فائدتها عملياً؟",
    faq_a6:
      "عندما يقدّم أحدهم تقريراً عن موقع (وصف نصي، ملاحظة، قياس)، يحوّل النظام هذا النص إلى متجه رقمي باستخدام نموذج لمعالجة اللغة الطبيعية — وهو هنا نموذج متعدد اللغات، لأن التقارير قد ترد بلغات مختلفة. يُخزَّن هذا المتجه في قاعدة بيانات Qdrant، المتخصصة في المقارنة السريعة لـ\"تشابه المعنى\" بين السجلات. عملياً، يتيح هذا للنظام تمييز ما إذا كان تقرير جديد متسقاً مع تقارير سابقة عن الموقع نفسه أو يختلف عنها — وهو ما يؤثر على مدى الثقة بذلك التقرير. بعبارة أخرى، لا يُحتسب فقط ما إذا كان قد تم الإبلاغ عن شيء، بل أيضاً مدى توافقه مع تاريخ الموقع السابق. كما تم دمج آلية مضادة لهجمات Sybil لمنع الإدخالات المزيّفة المنظّمة والتلاعب.",
    faq_q7: "ما هو \"geo-quadrant\"؟",
    faq_a7:
      "تُقسَّم المساحة إلى شبكة من المربعات (على غرار أنظمة geohash). كل مربع كيان مستقل له تاريخه الخاص، ودرجة ثقته الخاصة، وهويته الخاصة كرمز NFT على البلوكشين.",
    faq_q8: "لماذا البلوكشين، وليس مجرد بنية تحتية عادية للخوادم؟",
    faq_a8:
      "لأن الفكرة هي ألا يستطيع أي طرف — ولا حتى مؤلف النظام نفسه — إعادة كتابة التاريخ لاحقاً. وهذا مهم بشكل خاص عندما يجب أن تكون الثقة أساساً لأمر أكثر جدية: التأمين، اللوجستيات، العلوم، إدارة الموارد. يمكن إيقاف الخادم أو تعديله؛ أما التثبيت على البلوكشين فيبقى.",
    faq_q9:
      "هل هذا نفس شيء العملات المشفّرة أو مشاريع NFT التي يتحدث عنها الناس عادةً؟",
    faq_a9:
      "ليس بهذا المعنى. يُستخدم البلوكشين هنا كبنية تحتية لتسجيل الأدلة بشكل غير قابل للتغيير، وليس كأصل للمضاربة. توجد مكوّنة NFT، لكنها تمثّل هوية المربع، لا قطعة للتحصيل.",
    faq_q10: "من يقف وراء المشروع؟",
    faq_a10:
      "يطوّر Framework for Trust مطوّر واحد، بشكل مستقل، من بنية العقود الذكية إلى تطبيق الواجهة الخلفية والأمامية. المشروع حالياً في مرحلة التحضير للإصدار العلني للكود.",
    faq_q11: "هل هذا منتج مكتمل أم بحث مستمر؟",
    faq_a11:
      "كلاهما، على مستويات مختلفة. البنية الأساسية (العقود الذكية، حساب الثقة، التثبيت على السلسلة) تعمل من البداية إلى النهاية على شبكة اختبار. وفي الوقت نفسه، لا تزال هناك أسئلة مفتوحة — مثل إثبات تنفيذ النموذج ومقاومة التشفير ما بعد الكمّي — وهي لا تزال موضوع بحث مستمر.",
    faq_q12: "لماذا يجب أن يهمّني هذا الأمر إن كنت لا أفهم البلوكشين؟",
    faq_a12:
      "لأن المشكلة التي يحلّها Framework for Trust ليست تقنية، بل مسألة ثقة: كيف نعرف أن البيانات المتعلقة بمكان ما صحيحة، بينما لا يمكن لأحد التحقق فعلياً من كل نقطة على الكوكب؟ هذا سؤال يهمّ شركات التأمين، اللوجستيات، علوم المناخ، إدارة الكوارث — وهو في جوهره يهمّ الجميع — والحل الذي يُبنى هنا هو من المحاولات القليلة لحل هذه المشكلة دون الاعتماد على الثقة بمؤسسة واحدة.",
    faq_q13: "أين يمكنني متابعة تطور المشروع؟",
    faq_a13:
      "سيكون الكود متاحاً للجميع على GitHub، وستشرح وثيقة تقنية (الورقة البيضاء) البنية بالتفصيل لمن يريد فهماً أعمق. [سيُضاف الرابط عند الإطلاق.]",

    repo_section_title: "حول Framework for Trust – المستودع",
    repo_section_p1:
      "Framework for Trust (FfT) هو طبقة سمعة جغرافية للأحداث في العالم الحقيقي: كل بلاغ يرتبط بموقع (quadrant / subcell) ومحفظة وسمعة المصدر. يجمع النظام بين المكان والزمان وسمعة المصدر.",
    repo_section_p2:
      "هو التوكن الخدمي الداخلي للنظام. يُستخدم كـ stake عند إرسال الأحداث وكمكافأة على المساهمات عالية الجودة (Proof of Contribution). كلما زاد الـ stake + تحسنت السمعة ارتفع trust_score.",
    repo_section_source_rep_label: "سمعة المصدر",
    repo_section_p3:
      "تجمع بين التقييم الأساسي الذي يتم اختياره في واجهة المستخدم (slider)، ورصيد GCD على السلسلة، وسجل السلوك السابق. وعلى هذا الأساس يقدّر النظام مدى موثوقية الحدث الفردي.",
    repo_section_link: "🌐 فتح مستودع Framework for Trust",

    footer_rights: "جميع الحقوق محفوظة.",
  },

  es: {
    brand: "Framework for Trust",
    tagline: "Una capa de confianza geoespacial para el mundo real.",
    nav_project: "Proyecto",
    nav_whitepaper: "Whitepaper",
    nav_dapp: "dApp Mapa",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "Un registro geoespacial global de eventos, señales y correlaciones, asegurado por blockchain y abierto para todos.",
    hero_cta_whitepaper: "Leer el whitepaper",
    hero_cta_dapp: "Abrir dApp de mapa",

    section_project_title: "¿Qué es Framework for Trust?",
    section_project_text:
      "Framework for Trust es una infraestructura geoespacial descentralizada que vincula datos fiables, eventos y reputación con ubicaciones en la Tierra. Conecta señales del mundo real con tokens geoespaciales y métricas de correlación, permitiendo nuevas formas de verificar afirmaciones, evaluar riesgos y coordinar acciones.",

    section_whitepaper_title: "Whitepaper",
    section_whitepaper_intro:
      "El whitepaper explica los conceptos clave: cuadrantes geoespaciales, puntajes de confianza, métricas de correlación, economía de tokens e integración con sistemas existentes.",
    section_whitepaper_button: "Descargar PDF",

    section_video_title: "Video introductorio",
    section_video_text:
      "Mira una breve introducción a la visión detrás de Framework for Trust.",

    section_dapp_title: "dApp Mapa",
    section_dapp_text:
      "Explora cuadrantes geoespaciales, eventos on-chain, puntajes de confianza y eventos similares detectados por IA en el mapa interactivo.",

    section_faq_title: "FAQ",
    faq_q1: "¿Qué es Framework for Trust, en una frase?",
    faq_a1:
      "Un sistema que asigna al espacio geográfico un nivel de confianza medible y verificable, registrado en la blockchain de modo que nadie pueda modificarlo o cuestionarlo después.",
    faq_q2: "¿Por qué necesitaría un espacio tener \"confianza\"?",
    faq_a2:
      "Imagina un sensor, un dron, un dispositivo IoT o incluso un informe humano que afirma algo sobre una ubicación concreta: que el terreno es estable, que una zona es segura, que los datos de ese lugar son fiables. Hoy, esa afirmación suele aceptarse \"de palabra\". FfT, en cambio, construye un historial: cada ubicación (un llamado geocuadrante) acumula evidencia a lo largo del tiempo, y el sistema calcula cuánto se le puede confiar en función de ese historial. Los informes de sensores, dispositivos IoT y fuentes humanas de distinto origen se comparan algorítmica y semánticamente, dando como resultado la descripción más objetiva posible de un evento.",
    faq_q3: "¿En qué se diferencia esto de una base de datos común con calificaciones?",
    faq_a3:
      "Una base de datos puede modificarse silenciosamente. Aquí, cada evento —una medición, un informe, un cambio de estado— se marca con una fecha y se ancla en la blockchain (Polygon), creando un rastro inmutable de quién afirmó qué y cuándo. Esto no es una \"calificación\", sino un historial demostrable.",
    faq_q4: "¿Quién calcula ese nivel de confianza y se puede confiar en él?",
    faq_a4:
      "El cálculo combina dos cosas: un saldo on-chain (GCD) y un análisis semántico del contenido de los informes mediante un modelo de procesamiento de lenguaje natural. El resultado no se \"inventa\": cada cambio en la puntuación proviene de eventos registrados y verificables, no de la decisión de una sola persona, un interés particular o un servidor.",
    faq_q5: "¿Qué es el GCD y cómo se calcula exactamente?",
    faq_a5:
      "El GCD (GeoChain Data) es un token de reputación que lleva consigo cada contribuyente; no cambia según si la situación de una ubicación es buena o mala, sino según si la contribución en sí (un informe, una medición, un dato) es veraz. El sistema funciona bajo un modelo de Proof-of-Contribution: cuando una contribución se confirma como creíble, el contribuyente es recompensado con tokens GCD; cuando resulta ser falsa, se le retira el GCD (una penalización). Tanto la recompensa como la penalización se ejecutan como transacciones reales on-chain a través de contratos inteligentes, por lo que nada puede ajustarse manualmente: el saldo es la suma de todas las decisiones anteriores, públicamente verificables, sobre quién se ganó la confianza y quién abusó de ella. El GCD no está pensado para la especulación; es la economía real del sistema, con un propósito claro.",
    faq_q6:
      "¿Qué significan los \"embeddings semánticos\" y para qué sirven en la práctica?",
    faq_a6:
      "Cuando alguien envía un informe sobre una ubicación (una descripción textual, una observación, una medición), el sistema convierte ese texto en un vector numérico usando un modelo de procesamiento de lenguaje natural, en este caso un modelo multilingüe, ya que los informes pueden llegar en distintos idiomas. Ese vector se almacena en una base de datos Qdrant, especializada en comparar rápidamente la \"similitud de significado\" entre registros. En la práctica, esto permite al sistema reconocer si un nuevo informe es coherente con informes anteriores sobre la misma ubicación, o si se desvía de ellos, lo que influye en cuánto se confía en ese informe. Dicho de otro modo, no solo importa si algo fue reportado, sino cuánto encaja con el historial existente de esa ubicación. El sistema también incorpora un mecanismo anti-Sybil para prevenir registros falsos organizados y manipulaciones.",
    faq_q7: "¿Qué es un \"geocuadrante\"?",
    faq_a7:
      "El espacio se divide en una cuadrícula de cuadrantes (similar a los sistemas geohash). Cada cuadrante es una entidad independiente con su propio historial, su propia puntuación de confianza y su propia identidad NFT en la blockchain.",
    faq_q8: "¿Por qué blockchain y no simplemente una infraestructura de servidores común?",
    faq_a8:
      "Porque el objetivo es que ninguna parte —ni siquiera el propio autor del sistema— pueda reescribir el historial después. Esto es especialmente importante cuando la confianza debe servir de base para algo más serio: seguros, logística, ciencia, gestión de recursos. Un servidor puede apagarse o modificarse; el anclaje en la blockchain permanece.",
    faq_q9:
      "¿Es esto lo mismo que las criptomonedas o los proyectos NFT de los que normalmente se habla?",
    faq_a9:
      "No en ese sentido. Aquí la blockchain se usa como infraestructura para registrar pruebas de forma inmutable, no como un activo especulativo. Existe un componente NFT, pero representa la identidad de un cuadrante, no un objeto coleccionable.",
    faq_q10: "¿Quién está detrás del proyecto?",
    faq_a10:
      "FfT lo desarrolla un único desarrollador, de forma independiente, desde la arquitectura de los contratos inteligentes hasta la implementación del backend y el frontend. El proyecto se encuentra actualmente en preparación para la publicación pública del código.",
    faq_q11: "¿Es esto un producto terminado o una investigación en curso?",
    faq_a11:
      "Ambas cosas, en distintas capas. La arquitectura central (contratos inteligentes, cálculo de confianza, anclaje on-chain) funciona de extremo a extremo en una red de prueba. Al mismo tiempo, quedan preguntas abiertas —como la ejecución demostrable de modelos y la resistencia a la criptografía post-cuántica— que siguen siendo objeto de investigación.",
    faq_q12: "¿Por qué debería interesarme esto si no entiendo de blockchain?",
    faq_a12:
      "Porque el problema que resuelve FfT no es técnico, sino de confianza: ¿cómo saber que los datos sobre un lugar son ciertos, si nadie puede verificar físicamente cada punto del planeta? Es una cuestión relevante para aseguradoras, logística, ciencia del clima, gestión de desastres —en el fondo, relevante para todos— y la solución que se está construyendo aquí es uno de los pocos intentos de resolverlo sin depender de la confianza en una única institución.",
    faq_q13: "¿Dónde puedo seguir el desarrollo del proyecto?",
    faq_a13:
      "El código estará disponible públicamente en GitHub, y un documento técnico (whitepaper) explicará la arquitectura en detalle para quienes quieran profundizar.",

    repo_section_title: "Acerca de Framework for Trust – repositorio",
    repo_section_p1:
      "Framework for Trust (FfT) es una capa de georreputación para eventos del mundo real: cada reporte se vincula a una ubicación (quadrant / subcell), una wallet y la reputación de la fuente. El sistema combina espacio, tiempo y reputación de la fuente.",
    repo_section_p2:
      "es el token utilitario interno del sistema. Se utiliza como stake al enviar eventos y como recompensa por contribuciones de alta calidad (Proof of Contribution). Un stake más alto + una buena reputación significan un trust_score mayor.",
    repo_section_source_rep_label: "Reputación de la fuente",
    repo_section_p3:
      "combina la evaluación base seleccionada en la UI (slider), el balance on-chain de GCD y el historial de comportamiento previo. A partir de eso, el sistema estima cuán creíble es un evento individual.",
    repo_section_link: "🌐 Abrir el repositorio de Framework for Trust",

    footer_rights: "Todos los derechos reservados.",
  },

  pt: {
    brand: "Framework for Trust",
    tagline: "Uma camada de confiança geoespacial para o mundo real.",
    nav_project: "Projeto",
    nav_whitepaper: "Whitepaper",
    nav_dapp: "dApp Mapa",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "Um registro geoespacial global de eventos, sinais e correlações – protegido por blockchain e aberto para todos.",
    hero_cta_whitepaper: "Ler o whitepaper",
    hero_cta_dapp: "Abrir dApp do mapa",

    section_project_title: "O que é o Framework for Trust?",
    section_project_text:
      "Framework for Trust é uma infraestrutura geoespacial descentralizada que associa dados confiáveis, eventos e reputação a locais na Terra. Ele conecta sinais do mundo real a tokens geoespaciais e métricas de correlação, permitindo novas formas de verificar afirmações, avaliar riscos e coordenar ações.",

    section_whitepaper_title: "Whitepaper",
    section_whitepaper_intro:
      "O whitepaper explica os conceitos centrais: quadrantes geoespaciais, pontuações de confiança, métricas de correlação, economia de tokens e integração com sistemas existentes.",
    section_whitepaper_button: "Baixar PDF",

    section_video_title: "Vídeo de introdução",
    section_video_text:
      "Assista a uma breve introdução à visão por trás do Framework for Trust.",

    section_dapp_title: "dApp do mapa",
    section_dapp_text:
      "Explore quadrantes geoespaciais, eventos on-chain, pontuações de confiança e eventos semelhantes encontrados por IA no mapa interativo.",

    section_faq_title: "FAQ",
    faq_q1: "O que é o Framework for Trust, em uma frase?",
    faq_a1:
      "Um sistema que atribui ao espaço geográfico um nível de confiança mensurável e verificável — registrado na blockchain de forma que ninguém possa alterá-lo ou contestá-lo depois.",
    faq_q2: "Por que o espaço precisaria de \"confiança\"?",
    faq_a2:
      "Imagine um sensor, um drone, um dispositivo IoT ou até mesmo um relato humano afirmando algo sobre um local específico — que o terreno é estável, que uma zona é segura, que os dados daquele lugar são confiáveis. Hoje, essa afirmação costuma ser aceita \"de boca\". O FfT, em vez disso, constrói um histórico: cada local (um chamado geoquadrante) acumula evidências ao longo do tempo, e o sistema calcula o quanto se pode confiar nele com base nesse histórico. Relatos de sensores, dispositivos IoT e fontes humanas de diferentes origens são comparados algoritmicamente e semanticamente, produzindo a descrição mais objetiva possível de um evento.",
    faq_q3: "Como isso é diferente de um banco de dados comum com avaliações?",
    faq_a3:
      "Um banco de dados pode ser alterado silenciosamente. Aqui, cada evento — uma medição, um relato, uma mudança de estado — recebe uma marcação temporal e é ancorado na blockchain (Polygon), criando um rastro imutável de quem afirmou o quê e quando. Isso não é uma \"avaliação\", é um histórico comprovável.",
    faq_q4: "Quem calcula esse nível de confiança e ele é confiável?",
    faq_a4:
      "O cálculo combina duas coisas: um saldo on-chain (GCD) e uma análise semântica do conteúdo dos relatos usando um modelo de processamento de linguagem natural. O resultado não é \"inventado\" — cada mudança na pontuação vem de eventos registrados e verificáveis, não da decisão de uma única pessoa, interesse ou servidor.",
    faq_q5: "O que é o GCD e como ele é calculado, na prática?",
    faq_a5:
      "O GCD (GeoChain Data) é um token de reputação que cada colaborador carrega consigo — ele não muda de acordo com a situação (boa ou ruim) de um local, mas sim de acordo com se a própria contribuição (relato, medição, dado) é verdadeira. O sistema opera segundo um modelo de Proof-of-Contribution: quando uma contribuição é confirmada como confiável, o colaborador é recompensado com tokens GCD; quando uma contribuição se revela falsa, o GCD é retirado dele (penalidade). Tanto a recompensa quanto a penalidade são executadas como transações reais on-chain via smart contracts, de modo que nada pode ser ajustado manualmente — o saldo é a soma de todas as decisões anteriores, publicamente verificáveis, sobre quem mereceu confiança e quem abusou dela. O GCD não se destina à especulação; é a economia real do sistema, com um propósito claro.",
    faq_q6:
      "O que significam \"embeddings semânticos\" e para que servem na prática?",
    faq_a6:
      "Quando alguém envia um relato sobre um local (uma descrição textual, observação, medição), o sistema converte esse texto em um vetor numérico usando um modelo de processamento de linguagem natural — neste caso, um modelo multilíngue, já que os relatos podem chegar em idiomas diferentes. Esse vetor é armazenado em um banco de dados Qdrant, especializado na comparação rápida de \"similaridade de significado\" entre registros. Na prática, isso permite que o sistema reconheça se um novo relato é consistente com relatos anteriores sobre o mesmo local, ou se diverge deles — o que afeta o quanto aquele relato é confiável. Em outras palavras, não importa apenas se algo foi relatado, mas o quanto isso se encaixa no histórico existente do local. Um mecanismo anti-Sybil também está integrado ao sistema para impedir registros falsos organizados e manipulações.",
    faq_q7: "O que é um \"geoquadrante\"?",
    faq_a7:
      "O espaço é dividido em uma grade de quadrantes (semelhante aos sistemas geohash). Cada quadrante é uma entidade separada, com seu próprio histórico, sua própria pontuação de confiança e sua própria identidade NFT na blockchain.",
    faq_q8: "Por que blockchain, e não apenas uma infraestrutura de servidor comum?",
    faq_a8:
      "Porque a ideia é que nenhuma parte — nem mesmo o próprio autor do sistema — possa reescrever o histórico depois. Isso é especialmente importante quando a confiança precisa servir de base para algo mais sério: seguros, logística, ciência, gestão de recursos. Um servidor pode ser desligado ou alterado; a ancoragem na blockchain permanece.",
    faq_q9:
      "Isso é a mesma coisa que as criptomoedas ou projetos NFT dos quais normalmente se fala?",
    faq_a9:
      "Não nesse sentido. Aqui, a blockchain é usada como infraestrutura para registrar evidências de forma imutável, não como um ativo especulativo. Existe um componente NFT, mas ele representa a identidade de um quadrante, não um item colecionável.",
    faq_q10: "Quem está por trás do projeto?",
    faq_a10:
      "O FfT é desenvolvido por um único desenvolvedor, de forma independente, desde a arquitetura dos smart contracts até a implementação de backend e frontend. O projeto está atualmente em preparação para o lançamento público do código.",
    faq_q11: "Isso é um produto finalizado ou uma pesquisa em andamento?",
    faq_a11:
      "Ambos, em camadas diferentes. A arquitetura principal (smart contracts, cálculo de confiança, ancoragem on-chain) funciona de ponta a ponta em uma rede de teste. Ao mesmo tempo, permanecem questões em aberto — como a execução comprovável de modelos e a resistência à criptografia pós-quântica — que ainda são objeto de pesquisa contínua.",
    faq_q12: "Por que eu deveria me importar com isso se não entendo de blockchain?",
    faq_a12:
      "Porque o problema que o FfT resolve não é técnico, e sim de confiança: como saber que os dados sobre um lugar são verdadeiros, se ninguém consegue verificar fisicamente cada ponto do planeta? Essa é uma questão relevante para seguradoras, logística, ciência do clima, gestão de desastres — no fundo, relevante para todos — e a solução que está sendo construída aqui é uma das poucas tentativas de resolver isso sem depender da confiança em uma única instituição.",
    faq_q13: "Onde posso acompanhar o desenvolvimento do projeto?",
    faq_a13:
      "O código estará disponível publicamente no GitHub, e um documento técnico (whitepaper) explicará a arquitetura em detalhes para quem quiser um entendimento mais profundo. ",

    repo_section_title: "Sobre o Framework for Trust – repositório",
    repo_section_p1:
      "Framework for Trust (FfT) é uma camada de georreputação para eventos do mundo real: cada registro é vinculado a uma localização (quadrant / subcell), a uma wallet e à reputação da fonte. O sistema combina espaço, tempo e reputação da fonte.",
    repo_section_p2:
      "é o token utilitário interno do sistema. Ele é usado como stake ao enviar eventos e como recompensa por contribuições de alta qualidade (Proof of Contribution). Um stake maior + boa reputação significam um trust_score mais alto.",
    repo_section_source_rep_label: "Reputação da fonte",
    repo_section_p3:
      "combina a avaliação base selecionada na UI (slider), o saldo on-chain de GCD e o histórico de comportamento anterior. Com base nisso, o sistema estima quão confiável é um evento individual.",
    repo_section_link: "🌐 Abrir o repositório Framework for Trust",

    footer_rights: "Todos os direitos reservados.",
  },

  sl: {
    brand: "Framework for Trust",
    tagline: "Geoprostorski sloj zaupanja za resnični svet.",
    nav_project: "Projekt",
    nav_whitepaper: "Whitepaper",
    nav_dapp: "Mapa dApp",
    nav_faq: "FAQ",
    hero_title: "Framework for Trust",
    hero_subtitle:
      "Globalni geoprostorski register dogodkov, signalov in korelacij – zavarovan z verigo blokov in odprt za vse.",
    hero_cta_whitepaper: "Odpri whitepaper",
    hero_cta_dapp: "Odpri mapo dApp",

    section_project_title: "Kaj je Framework for Trust?",
    section_project_text:
      "Framework for Trust je decentralizirana geoprostorska infrastruktura, ki povezuje zanesljive podatke, dogodke in ugled z lokacijami na Zemlji. Dogodke iz resničnega sveta povezuje z geolokacijskimi žetoni in korelacijskimi metrikami ter omogoča nove načine preverjanja trditev, ocenjevanja tveganja in koordinacije.",

    section_whitepaper_title: "Whitepaper",
    section_whitepaper_intro:
      "Whitepaper razlaga ključne koncepte: geokvadrante, indekse zaupanja (trust_score), korelacijske metrike, ekonomijo žetonov ter integracijo z obstoječimi sistemi.",
    section_whitepaper_button: "Prenesi PDF",

    section_video_title: "Uvodni video",
    section_video_text:
      "Oglej si kratek uvod v vizijo projekta Framework for Trust.",

    section_dapp_title: "Mapa dApp",
    section_dapp_text:
      "Razišči geokvadrante, on-chain dogodke, trust ocene in z AI najdene podobne dogodke na interaktivnem zemljevidu.",

    section_faq_title: "FAQ",
    faq_q1: "Kaj je Framework for Trust, v enem stavku?",
    faq_a1:
      "Sistem, ki geografskemu prostoru dodeli merljivo, preverljivo raven zaupanja — zapisano na blockchainu tako, da je nihče kasneje ne more spremeniti ali izpodbijati.",
    faq_q2: "Zakaj bi prostor sploh potreboval \"zaupanje\"?",
    faq_a2:
      "Predstavljajte si senzor, dron, IoT napravo ali celo človeško poročilo, ki trdi nekaj o določeni lokaciji — da je teren stabilen, da je območje varno, da so podatki od tam zanesljivi. Danes se taka trditev običajno vzame \"na besedo\". FfT namesto tega gradi zgodovino: vsaka lokacija (t. i. geokvadrant) skozi čas kopiči dokaze, sistem pa na podlagi te zgodovine izračuna, koliko se ji lahko zaupa. Poročila senzorjev, IoT naprav in človeških virov iz različnih izvorov se algoritmično in semantično primerjajo, kar da najobjektivnejši možen opis dogodka.",
    faq_q3: "Kako se to razlikuje od navadne baze podatkov z ocenami?",
    faq_a3:
      "Bazo podatkov je mogoče tiho spremeniti. Tukaj je vsak dogodek — meritev, poročilo, sprememba stanja — časovno označen in zasidran na blockchainu (Polygon), tako da nastane nespremenljiva sled, kdo je kaj in kdaj trdil. To ni \"ocena\", temveč dokazljiva zgodovina.",
    faq_q4: "Kdo izračuna to raven zaupanja in ali se ji lahko zaupa?",
    faq_a4:
      "Izračun združuje dve stvari: on-chain saldo (GCD) in semantično analizo vsebine poročil s pomočjo modela za obdelavo naravnega jezika. Rezultat ni \"izmišljen\" — vsaka sprememba rezultata izhaja iz zabeleženih, preverljivih dogodkov, ne iz odločitve posameznika, interesa ali strežnika.",
    faq_q5: "Kaj je GCD in kako se dejansko izračuna?",
    faq_a5:
      "GCD (GeoChain Data) je žeton ugleda, ki ga nosi vsak prispevatelj — ne spreminja se glede na to, ali je stanje na neki lokaciji dobro ali slabo, temveč glede na to, ali je sam prispevek (poročilo, meritev, podatek) resničen. Sistem deluje po modelu Proof-of-Contribution: ko je prispevek potrjen kot verodostojen, je prispevatelj nagrajen z žetoni GCD; ko se izkaže, da je prispevek lažen, se mu GCD odvzame (kazen). Tako nagrada kot kazen se izvedeta kot resnični on-chain transakciji prek pametnih pogodb, zato ničesar ni mogoče ročno \"prilagoditi\" — saldo je vsota vseh prejšnjih, javno preverljivih odločitev o tem, kdo si je zaslužil zaupanje in kdo ga je zlorabil. GCD ni namenjen špekulacijam, temveč je realna ekonomija sistema z jasnim namenom.",
    faq_q6: "Kaj pomenijo \"semantični embeddingi\" in čemu služijo v praksi?",
    faq_a6:
      "Ko nekdo odda poročilo o lokaciji (besedilni opis, opažanje, meritev), sistem to besedilo s pomočjo modela za obdelavo naravnega jezika — v tem primeru večjezičnega modela, saj poročila lahko prispejo v različnih jezikih — pretvori v numerični vektor. Ta vektor se shrani v bazo Qdrant, specializirano za hitro primerjavo \"pomenske podobnosti\" med zapisi. V praksi to sistemu omogoča, da prepozna, ali je novo poročilo skladno s prejšnjimi poročili o isti lokaciji ali od njih odstopa — kar vpliva na to, koliko se temu poročilu zaupa. Z drugimi besedami, ne šteje le, ali je bilo nekaj prijavljeno, temveč tudi, kako dobro se to ujema z dosedanjo zgodovino lokacije. V sistem je vgrajen tudi mehanizem proti Sybil napadom, ki preprečuje organizirane lažne vnose dogodkov in manipulacije.",
    faq_q7: "Kaj je \"geokvadrant\"?",
    faq_a7:
      "Prostor je razdeljen na mrežo kvadrantov (podobno sistemom geohash). Vsak kvadrant je samostojna entiteta s svojo zgodovino, svojo oceno zaupanja in svojo NFT identiteto na blockchainu.",
    faq_q8: "Zakaj blockchain, ne pa preprosto navadna strežniška infrastruktura?",
    faq_a8:
      "Ker je bistvo v tem, da nobena stran — niti avtor sistema sam — kasneje ne more prepisati zgodovine. To je še posebej pomembno, kadar mora zaupanje služiti kot osnova za nekaj resnejšega: zavarovalništvo, logistiko, znanost, upravljanje virov. Strežnik je mogoče ugasniti ali spremeniti; sidranje na blockchainu ostane.",
    faq_q9:
      "Ali je to enako kriptovalutam ali NFT projektom, o katerih se običajno govori?",
    faq_a9:
      "Ne v tem smislu. Blockchain se tukaj uporablja kot infrastruktura za nespremenljivo beleženje dokazov, ne kot špekulativno premoženje. Komponenta NFT obstaja, vendar predstavlja identiteto kvadranta, ne zbirateljskega predmeta.",
    faq_q10: "Kdo stoji za projektom?",
    faq_a10:
      "FfT samostojno razvija en razvijalec — od arhitekture pametnih pogodb do implementacije backenda in frontenda. Projekt je trenutno v pripravi na javno objavo kode.",
    faq_q11: "Ali je to dokončan izdelek ali raziskava v teku?",
    faq_a11:
      "Oboje, na različnih ravneh. Osnovna arhitektura (pametne pogodbe, izračun zaupanja, on-chain sidranje) deluje od začetka do konca na testnem omrežju. Hkrati ostajajo odprta vprašanja — na primer dokazljivo izvajanje modelov in odpornost na post-kvantno kriptografijo — ki so še vedno predmet nadaljnjih raziskav.",
    faq_q12: "Zakaj bi me to zanimalo, če ne razumem blockchaina?",
    faq_a12:
      "Ker problem, ki ga rešuje FfT, ni tehničen, temveč je vprašanje zaupanja: kako vedeti, da so podatki o nekem kraju resnični, če nihče fizično ne more preveriti vsake točke na planetu? To je vprašanje, relevantno za zavarovalnice, logistiko, klimatologijo, upravljanje s katastrofami — v osnovi relevantno za vse — rešitev, ki nastaja tukaj, pa je eden redkih poskusov to rešiti brez zanašanja na zaupanje v eno samo institucijo.",
    faq_q13: "Kje lahko spremljam razvoj projekta?",
    faq_a13:
      "Koda bo javno dostopna na GitHubu, tehnični dokument (whitepaper) pa bo podrobno pojasnil arhitekturo za tiste, ki želijo globlje razumevanje.",

    repo_section_title: "O Framework for Trust – repozitorij",
    repo_section_p1:
      "Framework for Trust (FfT) je geoprostorski reputacijski sloj za dogodke iz resničnega sveta: vsaka prijava je vezana na lokacijo (quadrant / subcell), wallet in ugled vira. Sistem združuje prostor, čas in ugled vira.",
    repo_section_p2:
      "je interni utility token sistema. Uporablja se kot stake pri pošiljanju dogodkov in kot nagrada za kakovostne prispevke (Proof of Contribution). Višji stake + dober ugled pomenita višji trust_score.",
    repo_section_source_rep_label: "Ugled vira",
    repo_section_p3:
      "združuje osnovno oceno, izbrano v uporabniškem vmesniku (slider), on-chain stanje GCD in zgodovino preteklega vedenja. Na tej osnovi sistem oceni, kako verodostojen je posamezen dogodek.",
    repo_section_link: "🌐 Odpri repozitorij Framework for Trust",

    footer_rights: "Vse pravice pridržane.",
  },
};

// 2) SCROLL HELPER
const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

// 3) NAVBAR - language + theme toggle
function NavBar({ lang, setLang, theme, setTheme, t }) {
  return (
    <header className="ft-nav">
      <div className="ft-nav-brand" onClick={() => scrollToId("hero")}>
        <img src={LogoImg} alt="Framework for Trust logo" className="ft-logo" />
        <span className="ft-brand-text">{t("brand")}</span>
      </div>

      <nav className="ft-nav-links">
        <button onClick={() => scrollToId("project")}>{t("nav_project")}</button>
        <button onClick={() => scrollToId("whitepaper")}>
          {t("nav_whitepaper")}
        </button>
        <button onClick={() => scrollToId("dapp")}>{t("nav_dapp")}</button>
        <button onClick={() => scrollToId("faq")}>{t("nav_faq")}</button>
      </nav>

      <div className="ft-nav-controls">
        <div className="ft-theme-toggle">
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
        <div className="ft-lang-switch">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            aria-label="Language"
          >
            <option value="en">EN</option>
            <option value="sr">SR</option>
            <option value="fr">FR</option>
            <option value="ru">RU</option>
            <option value="de">DE</option>
            <option value="zh">ZH</option>
            <option value="ar">AR</option>
            <option value="es">ES</option>
            <option value="pt">PT</option>
            <option value="sl">SL</option>
          </select>
        </div>
      </div>
    </header>
  );
}

// 4) HERO
function HeroSection({ t }) {
  return (
    <section id="hero" className="ft-hero">
      <div className="ft-hero-content">
        <p className="ft-tagline">{t("tagline")}</p>
        <h1>{t("hero_title")}</h1>
        <p className="ft-hero-subtitle">{t("hero_subtitle")}</p>
        <div className="ft-hero-buttons">
          <button onClick={() => scrollToId("whitepaper")}>
            {t("hero_cta_whitepaper")}
          </button>
          <button onClick={() => scrollToId("dapp")}>
            {t("hero_cta_dapp")}
          </button>
        </div>
      </div>
      <div className="ft-hero-visual">
        <Globe />
      </div>
    </section>
  );
}

// 4.5) ABOUT / REPO SECTION
function RepoSection({ t }) {
  return (
    <section id="fft-repo" className="ft-section">
      <div className="ft-info-card">
        <h2 className="ft-panel-title ft-section-title">
          {t("repo_section_title")}
        </h2>

        <p className="ft-panel-text">{t("repo_section_p1")}</p>

        <p className="ft-panel-text">
          <strong>GCD token</strong> {t("repo_section_p2")}
        </p>

        <p className="ft-panel-text">
          <strong>{t("repo_section_source_rep_label")}</strong> {t("repo_section_p3")}
        </p>

        <a
          href="https://github.com/vladimir0605/FrameworkForTrust" // the real repo
          target="_blank"
          rel="noreferrer"
          className="ft-dapp-link"
        >
          {t("repo_section_link")}
        </a>
      </div>
    </section>
  );
}

// 5) PROJECT
function ProjectSection({ t }) {
  return (
    <section id="project" className="ft-section">
      <h2 className="ft-section-title">{t("section_project_title")}</h2>
      <p>{t("section_project_text")}</p>
    </section>
  );
}

// 6) WHITEPAPER + VIDEO
function WhitepaperSection({ t }) {
  return (
    <section id="whitepaper" className="ft-section">
      <h2 className="ft-section-title">{t("section_whitepaper_title")}</h2>
      <p>{t("section_whitepaper_intro")}</p>

      <div className="ft-whitepaper-actions">
        <a href="/whitepaper.pdf" target="_blank" rel="noopener noreferrer">
          <button>{t("section_whitepaper_button")}</button>
        </a>
      </div>

      <div className="ft-video-section">
        <h3 className="ft-video-title">{t("section_video_title")}</h3>
        <p>{t("section_video_text")}</p>
        <div className="ft-video-wrapper">
          <iframe
            src="https://www.youtube.com/embed/j2F4INQFjEI"
            title="Framework for Trust intro video"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </section>
  );
}

// 7) DAPP – MAP + WALLET 
function DappSection({ t }) {
  return (
    <section id="dapp" className="ft-section">
      <h2 className="ft-section-title">{t("section_dapp_title")}</h2>
      <p>{t("section_dapp_text")}</p>

      {/* Map */}
      <MapComponent />

      {/* Read-only info panel for all users */}
      <QuadrantInfoPanel apiBase={API_BASE} />

      {/* Wallet + On-chain status panel  */}
      <div className="ft-dapp-wallet">
        <GCDWallet apiBase={API_BASE} />

        <div className="ft-dapp-wallet-hint">
          <h3>On-chain status</h3>
          <ul>
            <li>Wallet connect (MetaMask, etc.)</li>
            <li>Network status (Amoy / mainnet / Shimmer…)</li>
            <li>Number of events registered in the Quadrant</li>
          </ul>
        </div>
      </div>

      {/* Testnet-only faucet — intentionally separate from the GCD reputation economy */}
      <TestnetFaucet apiBase={API_BASE} />

      {/* Quadrant Meta editor panel */}
      <QuadrantMetaPanel apiBase={API_BASE} />

      {/* New small moderation panel */}
      <EventModerationPanel apiBase={API_BASE} />
    </section>
  );
}

// 8) FAQ
const FAQ_ITEM_COUNT = 13;

function FAQSection({ t }) {
  return (
    <section id="faq" className="ft-section">
      <h2 className="ft-section-title">{t("section_faq_title")}</h2>
      {Array.from({ length: FAQ_ITEM_COUNT }, (_, i) => i + 1).map((n) => (
        <div className="ft-faq-item" key={n}>
          <h3>{t(`faq_q${n}`)}</h3>
          <p>{t(`faq_a${n}`)}</p>
        </div>
      ))}
    </section>
  );
}

// 9) FOOTER
function Footer({ t }) {
  const year = new Date().getFullYear();
  return (
    <footer className="ft-footer">
      <span>
        © {year} Framework for Trust. {t("footer_rights")}
      </span>
    </footer>
  );
}

// 10) MAIN APP 
function App() {
  const [lang, setLang] = useState("en");
  const [theme, setTheme] = useState("dark");

  const isRTL = lang === "ar";

  // translation helper 
  const t = (key) => {
    const pack = translations[lang] || translations.en;
    return pack[key] || translations.en[key] || key;
  };

  // light/dark theme – class on <body>
  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("ft-theme-light");
    } else {
      document.body.classList.remove("ft-theme-light");
    }
  }, [theme]);

  return (
    <div
      className={`ft-root ft-lang-${lang} ${isRTL ? "ft-rtl" : ""}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* status bar  backend/Qdrant/DB health */}
      <StatusBanner apiBase={API_BASE} />

      <NavBar
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
        t={t}
      />

      <main>
        <HeroSection t={t} />
        <ProjectSection t={t} />
        <WhitepaperSection t={t} />
        <RepoSection t={t} />
        <DappSection t={t} />
        <FAQSection t={t} />
      </main>

      <Footer t={t} />
    </div>
  );
}

export default App;

