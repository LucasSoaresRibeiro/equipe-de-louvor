/**
 * Transposição de tom e de linhas de cifra sem ChordSheetJS (compatível com Safari antigo, ex.: iOS 10).
 */

var NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function letterAccToSemitone(letter, acc) {
    var n = NOTE_SEMITONES[letter];
    if (n === undefined) {
        return 0;
    }
    if (acc === '#' || acc === '\u266F') {
        n += 1;
    } else if (acc === 'b' || acc === '\u266D') {
        n -= 1;
    }
    return ((n % 12) + 12) % 12;
}

function semitoneToSharpName(semi) {
    var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[((semi % 12) + 12) % 12];
}

function semitoneToFlatName(semi) {
    var names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return names[((semi % 12) + 12) % 12];
}

function semitoneToNoteName(semi, useFlats) {
    return useFlats ? semitoneToFlatName(semi) : semitoneToSharpName(semi);
}

/**
 * Transpõe um nome de nota (ex.: "Bb", "F#") por `steps` semitons.
 * Com `useFlats`, a saída usa bemóis; caso contrário, sustenidos.
 */
function transposeNoteToken(note, steps, useFlats) {
    if (!note || steps === 0) {
        return note;
    }
    var m = String(note).match(/^([A-Ga-g])([#b\u266F\u266D]?)$/);
    if (!m) {
        return note;
    }
    var letter = m[1].toUpperCase();
    var acc = m[2] || '';
    var semi = letterAccToSemitone(letter, acc);
    semi = (semi + steps + 12000) % 12;
    return semitoneToNoteName(semi, !!useFlats);
}

/**
 * Tom da música (ex.: "C", "Am", "Bb", "F#m") a partir do tom original e semitons relativos.
 */
function transposeKeyString(keyStr, steps, useFlats) {
    if (keyStr == null || keyStr === '' || !steps) {
        return keyStr;
    }
    var key = String(keyStr).trim();
    var m = key.match(/^([A-Ga-g])([#b\u266F\u266D]?)([\s\S]*)$/);
    if (!m) {
        return keyStr;
    }
    var newRoot = transposeNoteToken(m[1] + (m[2] || ''), steps, useFlats);
    return newRoot + (m[3] || '');
}

/**
 * Transpõe um acorde completo (sufixo + baixo opcional), preservando sufixos como maj7, sus4, m.
 */
function transposeChordSymbol(chord, steps, useFlats) {
    if (!chord || steps === 0) {
        return chord;
    }
    var trimmed = chord;
    var trailingSpaceMatch = trimmed.match(/\s*$/);
    var trailingSpaces = trailingSpaceMatch ? trailingSpaceMatch[0] : '';
    var core = trailingSpaces ? trimmed.slice(0, trimmed.length - trailingSpaces.length) : trimmed;
    if (!core) {
        return chord;
    }

    var numericTail = '';
    var nm = core.match(/([0-9]+\+?)$/);
    if (nm) {
        numericTail = nm[0];
        core = core.slice(0, core.length - numericTail.length);
    }

    var slashIdx = core.indexOf('/');
    if (slashIdx >= 0) {
        var left = core.slice(0, slashIdx);
        var bass = core.slice(slashIdx + 1);
        var lm = left.match(/^([A-Ga-g])([#b\u266F\u266D]?)(.*)$/);
        if (!lm) {
            return chord;
        }
        var newLeft =
            transposeNoteToken(lm[1] + (lm[2] || ''), steps, useFlats) + (lm[3] || '');
        var bm = bass.match(/^([A-Ga-g])([#b\u266F\u266D]?)(.*)$/);
        var newBass = bm ? transposeNoteToken(bm[1] + (bm[2] || ''), steps, useFlats) + (bm[3] || '') : bass;
        return newLeft + '/' + newBass + numericTail + trailingSpaces;
    }

    var rm = core.match(/^([A-Ga-g])([#b\u266F\u266D]?)(.*)$/);
    if (!rm) {
        return chord;
    }
    return transposeNoteToken(rm[1] + (rm[2] || ''), steps, useFlats) + (rm[3] || '') + numericTail + trailingSpaces;
}

/**
 * Equivale a chordLine.split(/(?<=\s)(?=\S)/): corta antes de cada carácter não-espaço
 * que segue um espaço (classe \s), sem consumir caracteres.
 * Cada trecho mantém largura fixa: só espaços, ou "acorde + espaços até o próximo acorde".
 * (Sem lookbehind — Safari antigo.)
 */
function splitChordLineSegments(chordLine) {
    var len = chordLine.length;
    if (len === 0) {
        return [];
    }
    var cut = [0];
    var i;
    for (i = 1; i < len; i++) {
        var prev = chordLine.charAt(i - 1);
        var cur = chordLine.charAt(i);
        if (/\s/.test(prev) && /\S/.test(cur)) {
            cut.push(i);
        }
    }
    cut.push(len);
    var segments = [];
    for (i = 0; i < cut.length - 1; i++) {
        segments.push(chordLine.slice(cut[i], cut[i + 1]));
    }
    return segments;
}

function transpose(direction) {
    var chordChart;

    if (!currentSongData.chord_chart_original) {
        chordChart = currentSongData.chord_chart;
        currentSongData.chord_chart_original = chordChart;
        currentSongData.key_original = currentSongData.key;
        currentSongData.key_accumulation = direction === 'up' ? 1 : -1;
    } else {
        chordChart = currentSongData.chord_chart_original;
        currentSongData.key_accumulation =
            direction === 'up'
                ? currentSongData.key_accumulation + 1
                : currentSongData.key_accumulation - 1;
    }
    currentSongData.chord_chart = transposeChordChart(
        chordChart,
        currentSongData.key_accumulation,
        currentSongData.key_accumulation < 0
    );
    currentSongData.key = transposeKeyString(
        currentSongData.key_original,
        currentSongData.key_accumulation,
        currentSongData.key_accumulation < 0
    );

    createSongContent(currentSongData);
}

function transposeChordChart(chordChart, steps, useFlats) {
    var lines = chordChart.split('\n');

    var transposedLines = lines.map(function (line) {
        if (line.charAt(0) !== '.') {
            return line;
        }

        var dotMatch = line.match(/^\.(\s*)/);
        var leadingSpaces = dotMatch ? dotMatch[1] : '';
        var chordLine = line.slice(1 + leadingSpaces.length);

        var chordSegments = splitChordLineSegments(chordLine);

        var transposedSegments = chordSegments.map(function (segment) {
            var chord = segment.trim();
            var trailingWsMatch = segment.match(/\s*$/);
            var originalSpacing = trailingWsMatch ? trailingWsMatch[0] : '';

            if (!chord) {
                return originalSpacing;
            }

            if (/^[0-9+\-\s]*$/.test(chord)) {
                return chord + originalSpacing;
            }

            var transposedChord = transposeChordSymbol(chord, steps, useFlats);
            var lengthDiff = chord.length - transposedChord.length;
            var adjustedSpacing;
            if (lengthDiff > 0) {
                adjustedSpacing = originalSpacing + new Array(lengthDiff + 1).join(' ');
            } else {
                adjustedSpacing = originalSpacing.slice(
                    0,
                    originalSpacing.length + lengthDiff
                );
            }
            if (adjustedSpacing === '') {
                adjustedSpacing = ' ';
            }
            return transposedChord + adjustedSpacing;
        });

        return '.' + leadingSpaces + transposedSegments.join('');
    });

    return transposedLines.join('\n');
}
