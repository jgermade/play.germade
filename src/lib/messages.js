// Every string the launcher shows, in English and Spanish (read through i18n.service.js).
// Catalog texts (descriptions, taglines) live in catalog.js as `{ en, es }` instead.

export const MESSAGES = {
  // ---- top bar ----
  'topbar.library': { en: 'Library', es: 'Biblioteca' },
  'topbar.language': { en: 'Language', es: 'Idioma' },

  // ---- home ----
  'home.play': { en: 'Play', es: 'Jugar' },
  'home.install': { en: 'Install', es: 'Instalar' },
  'home.uninstall': { en: 'Remove data', es: 'Quitar datos' },
  'home.soon': { en: 'Coming soon', es: 'Próximamente' },
  'home.open': { en: 'Open', es: 'Abrir' },
  'home.openLibrary': { en: 'Open library', es: 'Abrir biblioteca' },
  'home.details': { en: 'Details', es: 'Detalles' },
  'home.versions': { en: 'Versions', es: 'Versiones' },
  'home.back': { en: 'Back', es: 'Atrás' },
  'home.close': { en: 'Close', es: 'Cerrar' },
  'home.navigate': { en: 'Navigate', es: 'Navegar' },
  'home.updateReady': { en: 'A new version is ready.', es: 'Hay una versión nueva.' },
  'home.update': { en: 'Update', es: 'Actualizar' },

  // ---- hero ----
  'hero.emulator': { en: 'Emulator', es: 'Emulador' },
  'hero.retroModern': { en: 'Modern retro', es: 'Retro moderno' },
  'hero.installed': { en: 'Installed', es: 'Instalado' },
  'hero.engine': { en: 'engine {engine}', es: 'motor {engine}' },
  'games.one': { en: '{count} game', es: '{count} juego' },
  'games.many': { en: '{count} games', es: '{count} juegos' },

  // ---- notice ----
  'notice.emulator': {
    en: 'Each emulator will have its own ROM list, organized by game as in ROM Manager: several versions of a ROM grouped together, to choose which one to load, and ROM hacking patches applied on the fly while loading, without touching the original ROM.',
    es: 'Cada emulador tendrá su propia lista de ROMs, organizada por juego como en ROM Manager: varias versiones de una misma ROM agrupadas, para elegir cuál cargar, y parches de ROM hacking aplicados al vuelo durante la carga, sin tocar la ROM original.',
  },
  'notice.engine': {
    en: 'This game will arrive when its engine ({engine}) is moved to the engines’ common contract.',
    es: 'Este juego llegará cuando su motor ({engine}) esté migrado al contrato común de los motores.',
  },
  'notice.close': { en: 'Got it', es: 'Entendido' },

  // ---- install dialog ----
  'install.title': { en: 'Install {title}', es: 'Instalar {title}' },
  'install.lead': {
    en: 'The game data is not distributed: you bring your copy and it stays in your browser, in {path}. Saves are kept next to it.',
    es: 'Los datos del juego no se distribuyen: aportas tu copia y se queda en tu navegador, en {path}. Las partidas se guardan al lado.',
  },
  'install.optional': { en: 'optional', es: 'opcional' },
  'install.choose': { en: 'Choose', es: 'Elegir' },
  'install.chooseFile': { en: 'Choose {file}', es: 'Elegir {file}' },
  'install.chooseOrDrop': { en: 'Choose or drop {file}', es: 'Elegir o soltar {file}' },
  'install.file': { en: 'file', es: 'archivo' },
  'install.change': { en: 'Change', es: 'Cambiar' },
  'install.cancel': { en: 'Cancel', es: 'Cancelar' },
  'install.installing': { en: 'Installing…', es: 'Instalando…' },
  'install.installAndPlay': { en: 'Install and play', es: 'Instalar y jugar' },
  'install.missing': { en: 'Missing {file}', es: 'Falta {file}' },
  'install.expected': { en: '{name}: expected {accept}', es: '{name}: se esperaba {accept}' },

  // ---- route ----
  'route.back': { en: 'Back', es: 'Volver' },
  'route.loading': { en: 'Loading…', es: 'Cargando…' },
  'route.booting': { en: 'Starting the engine…', es: 'Arrancando el motor…' },
  'route.noEngine': { en: 'The engine "{engine}" is not available in this launcher.', es: 'El motor "{engine}" no está disponible en este lanzador.' },
  'route.notReady': { en: '{title} cannot be played yet.', es: '{title} todavía no se puede jugar.' },
  'route.notInLibrary': { en: '"{game}" is not in your {title} library.', es: '"{game}" no está en tu biblioteca de {title}.' },
  'route.modNotInLibrary': { en: 'That mod is not in your library.', es: 'Ese mod no está en tu biblioteca.' },
  'route.versionNotInLibrary': {
    en: 'That version is not in the library: the newest one is loaded.',
    es: 'Esa versión no está en la biblioteca: se carga la más reciente.',
  },
  'route.modFailed': { en: 'Could not apply “{mod}”: {reason}', es: 'No se pudo aplicar «{mod}»: {reason}' },
  'route.noBios': {
    en: 'The BIOS {file} is missing: add it to your {title} library.',
    es: 'Falta la BIOS {file}: añádela a la biblioteca de {title}.',
  },
  'patch.not-a-patch': { en: 'it is not an IPS, BPS or UPS patch', es: 'no es un parche IPS, BPS ni UPS' },
  'patch.truncated': { en: 'the patch ends too early', es: 'el parche se corta antes de tiempo' },
  'patch.damaged': { en: 'the patch is damaged (its CRC does not match)', es: 'el parche está dañado (su CRC no cuadra)' },
  'patch.wrong-source': { en: 'this mod is for another version of the ROM', es: 'este mod es para otra versión de la ROM' },
  'patch.wrong-result': { en: 'the result does not match what the mod promises', es: 'el resultado no coincide con el que el mod promete' },
  'patch.out-of-bounds': { en: 'the patch reads or writes outside the ROM', es: 'el parche lee o escribe fuera de la ROM' },

  // ---- generic app (engines without an app of their own) ----
  'pause.title': { en: 'Paused', es: 'Pausa' },
  'pause.continue': { en: 'Continue', es: 'Continuar' },
  'pause.restart': { en: 'Restart', es: 'Reiniciar' },
  'pause.back': { en: 'Back', es: 'Volver' },
  'pause.choose': { en: 'Choose', es: 'Elegir' },
  'pause.wrongSdk': { en: 'The SDK at {url} is not "{engine}"', es: 'El SDK en {url} no es "{engine}"' },

  // ---- ROM drawer ----
  'drawer.engineMenu': { en: 'Engine and ROM management', es: 'Motor y gestión de ROMs' },
  'drawer.engine': { en: 'Engine', es: 'Motor' },
  'drawer.engineLower': { en: 'engine', es: 'motor' },
  'drawer.soon': { en: 'coming soon', es: 'próximamente' },
  'drawer.needs.webgpu': { en: 'needs WebGPU', es: 'necesita WebGPU' },
  'drawer.manageRoms': { en: 'Manage ROMs', es: 'Gestionar ROMs' },
  'drawer.manage': { en: 'Manage', es: 'Gestionar' },
  'drawer.versions': { en: 'Versions', es: 'Versiones' },
  'drawer.versionsOf': { en: 'Versions of {title}', es: 'Versiones de {title}' },
  'drawer.addRoms': { en: 'Add ROMs', es: 'Añadir ROMs' },
  'drawer.moving': { en: 'Bringing your library into ROM Manager…', es: 'Trayendo tu biblioteca a ROM Manager…' },
  'drawer.moved': {
    en: 'Your library is in ROM Manager ({roms} ROMs, {mods} mods).',
    es: 'Tu biblioteca ya está en ROM Manager ({roms} ROMs, {mods} mods).',
  },
  'drawer.moveFailed': {
    en: 'Could not bring your library: {reason}. It will be retried.',
    es: 'No se pudo traer tu biblioteca: {reason}. Se reintentará.',
  },
  'drawer.empty': {
    en: 'Drop your {title} ROMs here (.zip too) or press Add ROMs. They stay in your browser, grouped by game; the versions of a game go together.',
    es: 'Suelta aquí tus ROMs de {title} (también .zip) o pulsa Añadir ROMs. Se quedan en tu navegador, agrupadas por juego; las versiones de un mismo juego van juntas.',
  },
  'drawer.hintPlay': { en: 'play', es: 'jugar' },
  'drawer.hintVersions': { en: 'versions', es: 'versiones' },
  'drawer.hintClose': { en: 'close', es: 'cerrar' },
  'drawer.asConsole': { en: 'As the console ({core})', es: 'Como la consola ({core})' },
  'drawer.mods': { en: 'Mods…', es: 'Mods…' },
  'drawer.close': { en: 'Close', es: 'Cerrar' },
  'drawer.newest': { en: 'the newest', es: 'la más reciente' },
  'drawer.play': { en: 'Play', es: 'Jugar' },
  'drawer.remove': { en: 'Remove', es: 'Quitar' },
  'drawer.removeHint': { en: 'Removes the ROM; the saves are kept', es: 'Quita la ROM; las partidas se conservan' },
  'drawer.nothingToAdd': { en: 'Nothing to add', es: 'Nada que añadir' },
  'drawer.loadBios': { en: 'Load BIOS', es: 'Cargar BIOS' },
  'drawer.biosLoaded': { en: 'BIOS · {file}', es: 'BIOS · {file}' },
  'drawer.biosReplace': { en: 'The BIOS {file} is in your library. Choose another to replace it.', es: 'La BIOS {file} está en tu biblioteca. Elige otra para sustituirla.' },
  'drawer.biosNeeded': {
    en: 'Besides the games, the BIOS {file} is needed: press Load BIOS.',
    es: 'Además de los juegos, hace falta la BIOS {file}: pulsa Cargar BIOS.',
  },
  'drawer.biosAlready': { en: 'The BIOS {file} was already there', es: 'La BIOS {file} ya estaba' },
  'drawer.notBios': {
    en: '{name} is not the BIOS: it is the file named {file}',
    es: '{name} no es la BIOS: es el archivo llamado {file}',
  },
  'drawer.bios.aes': { en: 'AES BIOS added', es: 'BIOS de AES añadida' },
  'drawer.bios.unibios': { en: 'BIOS added (Universe BIOS in console mode)', es: 'BIOS añadida (Universe BIOS en modo consola)' },
  'drawer.bios.mvs': {
    en: 'BIOS added, but with no AES or Universe BIOS: it will not boot as a console',
    es: 'BIOS añadida, pero sin AES ni Universe BIOS: no arrancará como consola',
  },
  'drawer.mod.verified': { en: 'verified', es: 'verificado' },
  'drawer.mod.unverified': { en: 'not verified', es: 'sin verificar' },
  'drawer.mod.mismatch': { en: 'does not match', es: 'no coincide' },
  'added.one': { en: '{count} ROM added', es: '{count} ROM añadida' },
  'added.many': { en: '{count} ROMs added', es: '{count} ROMs añadidas' },
  'already.one': { en: '{count} was already there', es: '{count} ya estaba' },
  'already.many': { en: '{count} were already there', es: '{count} ya estaban' },
  'rejected.one': { en: '{count} not recognized ({names})', es: '{count} no reconocida ({names})' },
  'rejected.many': { en: '{count} not recognized ({names})', es: '{count} no reconocidas ({names})' },
  'mods.one': { en: '{count} mod', es: '{count} mod' },
  'mods.many': { en: '{count} mods', es: '{count} mods' },
};
