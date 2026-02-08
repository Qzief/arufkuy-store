// Admin Features Module - Sections, Popups, Themes Management
// This file extends admin.html functionality

// ============================================================================
// SECTIONS MANAGEMENT
// ============================================================================

let sections = [];

window.loadSections = () => {
    const tableBody = document.getElementById("sections-table-body");

    onSnapshot(query(collection(db, "sections"), orderBy("order", "asc")), (snapshot) => {
        sections = [];
        tableBody.innerHTML = "";

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-slate-500">Belum ada section.</td></tr>`;
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            sections.push({ id: doc.id, ...data });

            const statusBadge = data.enabled
                ? '<span class="text-emerald-400 text-xs">Aktif</span>'
                : '<span class="text-red-400 text-xs">Nonaktif</span>';

            const row = `
        <tr class="hover:bg-white/5 transition">
          <td class="px-6 py-4">
            <span class="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded text-xs font-mono">${data.order}</span>
          </td>
          <td class="px-6 py-4 font-medium text-white">${data.name}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${data.description || '-'}</td>
          <td class="px-6 py-4">${statusBadge}</td>
          <td class="px-6 py-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="editSection('${doc.id}')" class="text-indigo-400 hover:text-indigo-300 text-xs border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition">Edit</button>
              <button onclick="deleteSection('${doc.id}')" class="text-red-400 hover:text-red-300 text-xs border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition">Hapus</button>
            </div>
          </td>
        </tr>
      `;
            tableBody.innerHTML += row;
        });
    });
};

window.openSectionModal = (mode, id = null) => {
    const modal = document.getElementById("section-modal");
    document.getElementById("section-form").reset();

    if (mode === 'edit' && id) {
        const section = sections.find(s => s.id === id);
        if (section) {
            document.getElementById("section-id").value = id;
            document.getElementById("section-name").value = section.name;
            document.getElementById("section-desc").value = section.description || '';
            document.getElementById("section-order").value = section.order;
            document.getElementById("section-enabled").checked = section.enabled;
            document.getElementById("section-modal-title").innerText = "Edit Section";
        }
    } else {
        document.getElementById("section-id").value = "";
        document.getElementById("section-modal-title").innerText = "Tambah Section";
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

window.closeSectionModal = () => {
    const modal = document.getElementById("section-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

window.editSection = (id) => {
    openSectionModal('edit', id);
};

window.deleteSection = async (id) => {
    if (confirm("Hapus section ini?")) {
        try {
            await deleteDoc(doc(db, "sections", id));
            showToast('Section berhasil dihapus', 'success');
        } catch (err) {
            showToast('Gagal hapus: ' + err.message, 'error');
        }
    }
};

document.getElementById("section-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = document.getElementById("section-id").value;
    const name = document.getElementById("section-name").value.trim();
    const description = document.getElementById("section-desc").value.trim();
    const order = parseInt(document.getElementById("section-order").value);
    const enabled = document.getElementById("section-enabled").checked;

    const sectionData = {
        name,
        description,
        order,
        enabled,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "sections", id), sectionData);
            showToast('Section berhasil diupdate', 'success');
        } else {
            sectionData.createdAt = serverTimestamp();
            await addDoc(collection(db, "sections"), sectionData);
            showToast('Section berhasil dibuat', 'success');
        }
        closeSectionModal();
    } catch (err) {
        showToast('Gagal menyimpan: ' + err.message, 'error');
    }
});

// ============================================================================
// POPUPS MANAGEMENT
// ============================================================================

let popups = [];

window.loadPopups = () => {
    const tableBody = document.getElementById("popups-table-body");

    onSnapshot(query(collection(db, "popups"), orderBy("priority", "asc")), (snapshot) => {
        popups = [];
        tableBody.innerHTML = "";

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-slate-500">Belum ada popup.</td></tr>`;
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            popups.push({ id: doc.id, ...data });

            const typeColors = {
                coupon: 'bg-emerald-500/20 text-emerald-300',
                announcement: 'bg-blue-500/20 text-blue-300',
                warning: 'bg-amber-500/20 text-amber-300',
                info: 'bg-indigo-500/20 text-indigo-300'
            };

            const typeBadge = `<span class="${typeColors[data.type] || typeColors.info} px-2 py-1 rounded text-xs">${data.type}</span>`;
            const frequencyText = data.frequency === 'once' ? 'Sekali' : (data.frequency === 'session' ? 'Per Session' : 'Selalu');
            const statusBadge = data.active
                ? '<span class="text-emerald-400 text-xs">Aktif</span>'
                : '<span class="text-red-400 text-xs">Nonaktif</span>';

            const row = `
        <tr class="hover:bg-white/5 transition">
          <td class="px-6 py-4 font-medium text-white">${data.title}</td>
          <td class="px-6 py-4">${typeBadge}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${frequencyText}</td>
          <td class="px-6 py-4">${statusBadge}</td>
          <td class="px-6 py-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="editPopup('${doc.id}')" class="text-indigo-400 hover:text-indigo-300 text-xs border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition">Edit</button>
              <button onclick="deletePopup('${doc.id}')" class="text-red-400 hover:text-red-300 text-xs border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition">Hapus</button>
            </div>
          </td>
        </tr>
      `;
            tableBody.innerHTML += row;
        });
    });
};

window.openPopupModal = (mode, id = null) => {
    const modal = document.getElementById("popup-modal");
    document.getElementById("popup-form").reset();

    if (mode === 'edit' && id) {
        const popup = popups.find(p => p.id === id);
        if (popup) {
            document.getElementById("popup-id").value = id;
            document.getElementById("popup-title").value = popup.title;
            document.getElementById("popup-content").value = popup.content;
            document.getElementById("popup-type").value = popup.type;
            document.getElementById("popup-frequency").value = popup.frequency;
            document.getElementById("popup-priority").value = popup.priority || 0;
            document.getElementById("popup-active").checked = popup.active;

            if (popup.startDate) {
                document.getElementById("popup-start-date").value = popup.startDate;
            }
            if (popup.endDate) {
                document.getElementById("popup-end-date").value = popup.endDate;
            }

            document.getElementById("popup-modal-title").innerText = "Edit Popup";
        }
    } else {
        document.getElementById("popup-id").value = "";
        document.getElementById("popup-modal-title").innerText = "Tambah Popup";
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

window.closePopupModal = () => {
    const modal = document.getElementById("popup-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

window.editPopup = (id) => {
    openPopupModal('edit', id);
};

window.deletePopup = async (id) => {
    if (confirm("Hapus popup ini?")) {
        try {
            await deleteDoc(doc(db, "popups", id));
            showToast('Popup berhasil dihapus', 'success');
        } catch (err) {
            showToast('Gagal hapus: ' + err.message, 'error');
        }
    }
};

document.getElementById("popup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = document.getElementById("popup-id").value;
    const title = document.getElementById("popup-title").value.trim();
    const content = document.getElementById("popup-content").value.trim();
    const type = document.getElementById("popup-type").value;
    const frequency = document.getElementById("popup-frequency").value;
    const priority = parseInt(document.getElementById("popup-priority").value);
    const active = document.getElementById("popup-active").checked;
    const startDate = document.getElementById("popup-start-date").value;
    const endDate = document.getElementById("popup-end-date").value;

    const popupData = {
        title,
        content,
        type,
        frequency,
        priority,
        active,
        updatedAt: serverTimestamp()
    };

    if (startDate) popupData.startDate = startDate;
    if (endDate) popupData.endDate = endDate;

    try {
        if (id) {
            await updateDoc(doc(db, "popups", id), popupData);
            showToast('Popup berhasil diupdate', 'success');
        } else {
            popupData.createdAt = serverTimestamp();
            await addDoc(collection(db, "popups"), popupData);
            showToast('Popup berhasil dibuat', 'success');
        }
        closePopupModal();
    } catch (err) {
        showToast('Gagal menyimpan: ' + err.message, 'error');
    }
});

// ============================================================================
// THEMES MANAGEMENT
// ============================================================================

let themes = [];

window.loadThemes = () => {
    const tableBody = document.getElementById("themes-table-body");

    onSnapshot(collection(db, "themes"), (snapshot) => {
        themes = [];
        tableBody.innerHTML = "";

        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-slate-500">Belum ada tema.</td></tr>`;
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            themes.push({ id: doc.id, ...data });

            const modeText = data.activationMode === 'auto' ? 'Auto' : 'Manual';
            const modeBadge = data.activationMode === 'auto'
                ? '<span class="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs">Auto</span>'
                : '<span class="bg-purple-500/20 text-purple-300 px-2 py-1 rounded text-xs">Manual</span>';

            let dateText = '-';
            if (data.activationMode === 'auto' && data.startDate && data.endDate) {
                dateText = `${data.startDate} - ${data.endDate}`;
            }

            const statusBadge = data.active
                ? '<span class="text-emerald-400 text-xs">Aktif</span>'
                : '<span class="text-red-400 text-xs">Nonaktif</span>';

            const row = `
        <tr class="hover:bg-white/5 transition">
          <td class="px-6 py-4 font-medium text-white">${data.name}</td>
          <td class="px-6 py-4">${modeBadge}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${dateText}</td>
          <td class="px-6 py-4">${statusBadge}</td>
          <td class="px-6 py-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="editTheme('${doc.id}')" class="text-indigo-400 hover:text-indigo-300 text-xs border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition">Edit</button>
              <button onclick="deleteTheme('${doc.id}')" class="text-red-400 hover:text-red-300 text-xs border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition">Hapus</button>
            </div>
          </td>
        </tr>
      `;
            tableBody.innerHTML += row;
        });
    });
};

window.toggleThemeDateInputs = () => {
    const mode = document.getElementById("theme-activation-mode").value;
    const dateRange = document.getElementById("theme-date-range");

    if (mode === 'auto') {
        dateRange.classList.remove('hidden');
        dateRange.querySelectorAll('input').forEach(inp => inp.required = true);
    } else {
        dateRange.classList.add('hidden');
        dateRange.querySelectorAll('input').forEach(inp => inp.required = false);
    }
};

window.openThemeModal = (mode, id = null) => {
    const modal = document.getElementById("theme-modal");
    document.getElementById("theme-form").reset();

    if (mode === 'edit' && id) {
        const theme = themes.find(t => t.id === id);
        if (theme) {
            document.getElementById("theme-id").value = id;
            document.getElementById("theme-name").value = theme.name;
            document.getElementById("theme-activation-mode").value = theme.activationMode || 'auto';
            document.getElementById("theme-start-date").value = theme.startDate || '';
            document.getElementById("theme-end-date").value = theme.endDate || '';
            document.getElementById("theme-color-primary").value = theme.colors?.primary || '#8B7355';
            document.getElementById("theme-color-accent").value = theme.colors?.accent || '#FFD700';
            document.getElementById("theme-css-class").value = theme.cssClass || '';
            document.getElementById("theme-particle-type").value = theme.effects?.particleType || 'none';
            document.getElementById("theme-particles-enabled").checked = theme.effects?.particles !== false;
            document.getElementById("theme-decorations-enabled").checked = theme.effects?.decorations !== false;
            document.getElementById("theme-active").checked = theme.active !== false;

            document.getElementById("theme-modal-title").innerText = "Edit Tema";
        }
    } else {
        document.getElementById("theme-id").value = "";
        document.getElementById("theme-modal-title").innerText = "Tambah Tema";
    }

    toggleThemeDateInputs();
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

window.closeThemeModal = () => {
    const modal = document.getElementById("theme-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

window.editTheme = (id) => {
    openThemeModal('edit', id);
};

window.deleteTheme = async (id) => {
    if (confirm("Hapus tema ini?")) {
        try {
            await deleteDoc(doc(db, "themes", id));
            showToast('Tema berhasil dihapus', 'success');
        } catch (err) {
            showToast('Gagal hapus: ' + err.message, 'error');
        }
    }
};

document.getElementById("theme-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = document.getElementById("theme-id").value;
    const name = document.getElementById("theme-name").value.trim();
    const activationMode = document.getElementById("theme-activation-mode").value;
    const startDate = document.getElementById("theme-start-date").value;
    const endDate = document.getElementById("theme-end-date").value;
    const colorPrimary = document.getElementById("theme-color-primary").value;
    const colorAccent = document.getElementById("theme-color-accent").value;
    const cssClass = document.getElementById("theme-css-class").value.trim();
    const particleType = document.getElementById("theme-particle-type").value;
    const particlesEnabled = document.getElementById("theme-particles-enabled").checked;
    const decorationsEnabled = document.getElementById("theme-decorations-enabled").checked;
    const active = document.getElementById("theme-active").checked;

    const themeData = {
        name,
        activationMode,
        colors: {
            primary: colorPrimary,
            accent: colorAccent
        },
        effects: {
            particles: particlesEnabled,
            particleType: particleType,
            decorations: decorationsEnabled
        },
        cssClass,
        active,
        updatedAt: serverTimestamp()
    };

    if (activationMode === 'auto') {
        themeData.startDate = startDate;
        themeData.endDate = endDate;
    }

    try {
        if (id) {
            await updateDoc(doc(db, "themes", id), themeData);
            showToast('Tema berhasil diupdate', 'success');
        } else {
            themeData.createdAt = serverTimestamp();
            await addDoc(collection(db, "themes"), themeData);
            showToast('Tema berhasil dibuat', 'success');
        }
        closeThemeModal();
    } catch (err) {
        showToast('Gagal menyimpan: ' + err.message, 'error');
    }
});

console.log('Admin features module loaded');
