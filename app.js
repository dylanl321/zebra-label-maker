// ZPL Label Maker - App Logic

(function() {
    'use strict';

    // --- Constants ---
    const DPI = 203;
    const FONT_SIZES = { small: 20, medium: 30, large: 40, xl: 56 };
    const LABEL_PRESETS = {
        '2.25x1.25': { w: 2.25, h: 1.25 },
        '4x6': { w: 4, h: 6 },
        '2x1': { w: 2, h: 1 },
        '3x2': { w: 3, h: 2 },
        '4x2': { w: 4, h: 2 }
    };

    // --- State ---
    let labels = [];
    let currentPreviewIndex = 0;
    let debounceTimer = null;

    // --- DOM refs ---
    const $ = id => document.getElementById(id);
    const labelInput = $('labelInput');
    const previewContainer = $('previewContainer');
    const labelCountEl = $('labelCount');
    const previewIndicator = $('previewIndicator');

    // --- Settings ---
    function getSettings() {
        const defaults = {
            labelSize: '2.25x1.25',
            customWidth: 2.25,
            customHeight: 1.25,
            darkness: 15,
            printSpeed: 4,
            fontSize: 'medium',
            orientation: 'portrait',
            printerIp: '',
            printerPort: 9100,
            printServerUrl: 'http://localhost:5555'
        };
        try {
            const saved = JSON.parse(localStorage.getItem('zplSettings') || '{}');
            return { ...defaults, ...saved };
        } catch { return defaults; }
    }

    function saveSettings() {
        const s = {
            labelSize: $('labelSize').value,
            customWidth: parseFloat($('customWidth').value) || 2.25,
            customHeight: parseFloat($('customHeight').value) || 1.25,
            darkness: parseInt($('darkness').value),
            printSpeed: parseInt($('printSpeed').value),
            fontSize: $('fontSize').value,
            orientation: $('orientation').value,
            printerIp: $('printerIp').value,
            printerPort: parseInt($('printerPort').value) || 9100,
            printServerUrl: $('printServerUrl').value
        };
        localStorage.setItem('zplSettings', JSON.stringify(s));
        updatePreview();
    }

    function loadSettings() {
        const s = getSettings();
        $('labelSize').value = s.labelSize;
        $('customWidth').value = s.customWidth;
        $('customHeight').value = s.customHeight;
        $('darkness').value = s.darkness;
        $('darknessValue').textContent = s.darkness;
        $('printSpeed').value = s.printSpeed;
        $('speedValue').textContent = s.printSpeed;
        $('fontSize').value = s.fontSize;
        $('orientation').value = s.orientation;
        $('printerIp').value = s.printerIp;
        $('printerPort').value = s.printerPort;
        $('printServerUrl').value = s.printServerUrl;
        $('customSize').style.display = s.labelSize === 'custom' ? 'flex' : 'none';
    }

    function getLabelDimensions() {
        const s = getSettings();
        let w, h;
        if (s.labelSize === 'custom') {
            w = s.customWidth;
            h = s.customHeight;
        } else {
            const preset = LABEL_PRESETS[s.labelSize];
            w = preset.w;
            h = preset.h;
        }
        if (s.orientation === 'landscape') [w, h] = [h, w];
        return { w, h, wDots: Math.round(w * DPI), hDots: Math.round(h * DPI) };
    }

    // --- Parser ---
    function parseLabels(text) {
        if (!text.trim()) return [];
        
        const blocks = text.split(/\n\s*\n/);
        const result = [];

        for (const block of blocks) {
            const lines = block.split('\n').filter(l => l.trim() !== '');
            if (lines.length === 0) continue;

            let qty = 1;
            let contentLines = [...lines];

            // Check last line for quantity
            const lastLine = contentLines[contentLines.length - 1].trim();
            const qtyMatch = lastLine.match(/^[xX](\d+)$/);
            if (qtyMatch) {
                qty = parseInt(qtyMatch[1]);
                contentLines.pop();
            } else {
                // Check if last line ends with xN
                const inlineQty = lastLine.match(/\s+[xX](\d+)$/);
                if (inlineQty) {
                    qty = parseInt(inlineQty[1]);
                    contentLines[contentLines.length - 1] = lastLine.replace(/\s+[xX]\d+$/, '');
                }
            }

            if (contentLines.length === 0) continue;

            const parsedLines = contentLines.map(line => {
                const trimmed = line.trim();
                
                // Separator
                if (/^-{3,}$/.test(trimmed)) return { type: 'separator' };
                
                // Barcode
                const barcodeMatch = trimmed.match(/^\[barcode:CODE128:(.+)\]$/i);
                if (barcodeMatch) return { type: 'barcode', data: barcodeMatch[1] };
                
                // QR
                const qrMatch = trimmed.match(/^\[qr:(.+)\]$/i);
                if (qrMatch) return { type: 'qr', data: qrMatch[1] };
                
                // Header
                if (trimmed.startsWith('#')) return { type: 'text', text: trimmed.slice(1).trim(), style: 'header' };
                
                // Center
                if (trimmed.startsWith('<>')) return { type: 'text', text: trimmed.slice(2).trim(), style: 'center' };
                
                // Right
                if (trimmed.startsWith('>')) return { type: 'text', text: trimmed.slice(1).trim(), style: 'right' };
                
                // Bold
                const boldMatch = trimmed.match(/^\*(.+)\*$/);
                if (boldMatch) return { type: 'text', text: boldMatch[1], style: 'bold' };
                
                // Normal
                return { type: 'text', text: trimmed, style: 'normal' };
            });

            result.push({ lines: parsedLines, qty });
        }

        return result;
    }

    // --- Preview ---
    function updatePreview() {
        labels = parseLabels(labelInput.value);
        const total = labels.reduce((sum, l) => sum + l.qty, 0);
        labelCountEl.textContent = `${labels.length} label${labels.length !== 1 ? 's' : ''} (${total} total)`;

        if (labels.length === 0) {
            previewContainer.innerHTML = '<div class="preview-empty">Enter label text to see preview</div>';
            previewIndicator.textContent = 'No labels';
            return;
        }

        previewIndicator.textContent = `${labels.length} label${labels.length !== 1 ? 's' : ''}`;
        const dim = getLabelDimensions();
        const scale = 2; // px per dot-unit for display
        const pxW = Math.min(dim.w * 96, 400);
        const pxH = Math.min(dim.h * 96, 500);

        previewContainer.innerHTML = '';
        labels.forEach((label, idx) => {
            const el = document.createElement('div');
            el.className = 'label-preview';
            el.style.width = pxW + 'px';
            el.style.minHeight = pxH + 'px';

            if (label.qty > 1) {
                el.innerHTML += `<span class="qty-badge">×${label.qty}</span>`;
            }

            const baseFontSize = { small: 11, medium: 14, large: 17, xl: 22 }[getSettings().fontSize] || 14;

            label.lines.forEach(line => {
                if (line.type === 'separator') {
                    el.innerHTML += '<div class="label-separator"></div>';
                } else if (line.type === 'barcode') {
                    el.innerHTML += `<div class="label-barcode">||||| ${line.data} |||||</div>`;
                } else if (line.type === 'qr') {
                    el.innerHTML += `<div class="label-qr">QR</div>`;
                } else {
                    let cls = 'label-line';
                    let style = `font-size:${baseFontSize}px;`;
                    if (line.style === 'bold') cls += ' bold';
                    if (line.style === 'header') { cls += ' header'; style = `font-size:${baseFontSize * 1.5}px;font-weight:700;`; }
                    if (line.style === 'right') cls += ' right';
                    if (line.style === 'center') cls += ' center';
                    el.innerHTML += `<div class="${cls}" style="${style}">${escapeHtml(line.text)}</div>`;
                }
            });

            previewContainer.appendChild(el);
        });
    }

    function escapeHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // --- ZPL Generation ---
    function generateZPL() {
        const s = getSettings();
        const dim = getLabelDimensions();
        const fontSize = FONT_SIZES[s.fontSize] || 30;
        const headerSize = Math.round(fontSize * 1.8);
        let zpl = '';

        labels.forEach(label => {
            let y = 30;
            const lineHeight = fontSize + 12;
            const headerLineHeight = headerSize + 16;

            zpl += '^XA\n';
            zpl += `^PW${dim.wDots}\n`;
            zpl += `^LL${dim.hDots}\n`;
            zpl += `~SD${s.darkness}\n`;
            zpl += `^PR${s.printSpeed}\n`;
            zpl += `^CF0,${fontSize}\n`;

            label.lines.forEach(line => {
                if (line.type === 'separator') {
                    zpl += `^FO10,${y}^GB${dim.wDots - 20},1,2^FS\n`;
                    y += 16;
                } else if (line.type === 'barcode') {
                    zpl += `^FO20,${y}^BY2,2,60^BCN,60,Y,N,N^FD${line.data}^FS\n`;
                    y += 90;
                } else if (line.type === 'qr') {
                    zpl += `^FO20,${y}^BQN,2,5^FDQA,${line.data}^FS\n`;
                    y += 120;
                } else {
                    let x = 20;
                    let fSize = fontSize;
                    let fWidth = fontSize;

                    if (line.style === 'header') {
                        fSize = headerSize;
                        fWidth = headerSize;
                    } else if (line.style === 'bold') {
                        fWidth = fontSize + 8;
                    }

                    if (line.style === 'center') {
                        x = Math.round(dim.wDots / 2);
                        zpl += `^FO0,${y}^A0N,${fSize},${fWidth}^FB${dim.wDots},1,0,C^FD${line.text}^FS\n`;
                    } else if (line.style === 'right') {
                        zpl += `^FO0,${y}^A0N,${fSize},${fWidth}^FB${dim.wDots - 20},1,0,R^FD${line.text}^FS\n`;
                    } else {
                        zpl += `^FO${x},${y}^A0N,${fSize},${fWidth}^FD${line.text}^FS\n`;
                    }

                    y += (line.style === 'header') ? headerLineHeight : lineHeight;
                }
            });

            if (label.qty > 1) {
                zpl += `^PQ${label.qty}\n`;
            }

            zpl += '^XZ\n\n';
        });

        return zpl.trim();
    }

    // --- Print functions ---
    function copyZPL() {
        const zpl = generateZPL();
        if (!zpl) { showToast('No labels to copy', 'error'); return; }
        navigator.clipboard.writeText(zpl).then(() => {
            showToast('ZPL copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = zpl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('ZPL copied to clipboard!', 'success');
        });
    }

    function browserPrint() {
        window.print();
    }

    async function networkPrint() {
        const s = getSettings();
        const zpl = generateZPL();
        if (!zpl) { showToast('No labels to print', 'error'); return; }
        if (!s.printerIp) { showToast('Set printer IP in settings first', 'error'); return; }

        try {
            const resp = await fetch(s.printServerUrl + '/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ zpl, ip: s.printerIp, port: s.printerPort })
            });
            if (resp.ok) {
                showToast('Sent to printer!', 'success');
            } else {
                const err = await resp.text();
                showToast('Print failed: ' + err, 'error');
            }
        } catch (e) {
            showToast('Cannot reach print server. Is print-server.py running?', 'error');
        }
    }

    // --- Toast ---
    function showToast(msg, type = '') {
        const toast = $('toast');
        toast.textContent = msg;
        toast.className = 'toast show ' + type;
        setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    // --- Modal helpers ---
    function openModal(id) { $(id).classList.add('active'); }
    function closeModal(id) { $(id).classList.remove('active'); }

    // --- Event Listeners ---
    function init() {
        loadSettings();
        updatePreview();

        // Input
        labelInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updatePreview, 300);
        });

        // Settings
        $('settingsBtn').addEventListener('click', () => openModal('settingsModal'));
        $('closeSettings').addEventListener('click', () => { saveSettings(); closeModal('settingsModal'); });
        $('labelSize').addEventListener('change', function() {
            $('customSize').style.display = this.value === 'custom' ? 'flex' : 'none';
            saveSettings();
        });
        $('darkness').addEventListener('input', function() { $('darknessValue').textContent = this.value; });
        $('printSpeed').addEventListener('input', function() { $('speedValue').textContent = this.value; });
        
        // Save on any settings change
        ['labelSize','customWidth','customHeight','darkness','printSpeed','fontSize','orientation','printerIp','printerPort','printServerUrl'].forEach(id => {
            $(id).addEventListener('change', saveSettings);
        });

        // ZPL view
        $('viewZplBtn').addEventListener('click', () => {
            $('zplOutput').textContent = generateZPL() || 'No labels to generate';
            openModal('zplModal');
        });
        $('closeZpl').addEventListener('click', () => closeModal('zplModal'));

        // Help
        $('helpBtn').addEventListener('click', () => openModal('helpModal'));
        $('closeHelp').addEventListener('click', () => closeModal('helpModal'));

        // Copy ZPL button in editor
        $('copyZplBtn').addEventListener('click', copyZPL);

        // Print modal
        $('printBtn').addEventListener('click', () => openModal('printModal'));
        $('closePrint').addEventListener('click', () => closeModal('printModal'));
        $('printCopy').addEventListener('click', () => { closeModal('printModal'); copyZPL(); });
        $('printBrowser').addEventListener('click', () => { closeModal('printModal'); browserPrint(); });
        $('printNetwork').addEventListener('click', () => { closeModal('printModal'); networkPrint(); });

        // Preview nav (scroll)
        $('prevLabel').addEventListener('click', () => {
            previewContainer.scrollBy({ left: -300, behavior: 'smooth' });
        });
        $('nextLabel').addEventListener('click', () => {
            previewContainer.scrollBy({ left: 300, behavior: 'smooth' });
        });

        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
