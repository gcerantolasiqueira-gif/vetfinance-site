const ownerLogin = document.querySelector("#ownerLogin");
const installerForm = document.querySelector("#installerForm");
const ownerUser = document.querySelector("#ownerUser");
const ownerPassword = document.querySelector("#ownerPassword");
const installerFile = document.querySelector("#installerFile");
const selectedFile = document.querySelector("#selectedFile");
const loginMessage = document.querySelector("#loginMessage");
const installerMessage = document.querySelector("#installerMessage");
const logoutButton = document.querySelector("#logoutButton");
const downloadLinks = document.querySelectorAll(".download-link");

function disableDownload() {
  downloadLinks.forEach((link) => {
    link.href = "#";
    link.removeAttribute("download");
    link.setAttribute("aria-disabled", "true");
  });
}

function enableDownload(fileName) {
  downloadLinks.forEach((link) => {
    link.href = "/download";
    link.download = fileName || "VetFinance";
    link.removeAttribute("aria-disabled");
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "";

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshInstallerStatus() {
  try {
    const response = await fetch("/api/installer");
    const data = await response.json();

    if (data.available) {
      enableDownload(data.fileName);
      selectedFile.textContent = `${data.fileName} (${formatFileSize(data.size)})`;
      return;
    }
  } catch {
    // The static file can still open without the server, but uploads need server.js.
  }

  disableDownload();
}

function showInstallerForm() {
  ownerLogin.classList.add("hidden");
  installerForm.classList.remove("hidden");
}

function showLoginForm() {
  installerForm.classList.add("hidden");
  ownerLogin.classList.remove("hidden");
  ownerPassword.value = "";
}

ownerLogin.addEventListener("submit", async (event) => {
  event.preventDefault();

  const user = ownerUser.value.trim();
  const password = ownerPassword.value.trim();

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Usuário ou senha incorretos.");
    }

    loginMessage.textContent = "";
    loginMessage.classList.remove("error");
    showInstallerForm();
    return;
  } catch (error) {
    loginMessage.textContent = error.message;
    loginMessage.classList.add("error");
  }
});

installerFile.addEventListener("change", () => {
  const file = installerFile.files?.[0];

  if (!file) {
    selectedFile.textContent = "Nenhum instalador selecionado.";
    return;
  }

  selectedFile.textContent = `${file.name} (${formatFileSize(file.size)})`;
  installerMessage.textContent = "";
  installerMessage.classList.remove("error");
});

installerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = installerFile.files?.[0];

  if (!file) {
    installerMessage.textContent = "Selecione o instalador antes de liberar o download.";
    installerMessage.classList.add("error");
    return;
  }

  const formData = new FormData();
  formData.append("installer", file);

  installerMessage.textContent = "Enviando instalador...";
  installerMessage.classList.remove("error");

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível subir o instalador.");
    }

    enableDownload(data.fileName);
    selectedFile.textContent = `${data.fileName} (${formatFileSize(data.size)})`;
    installerMessage.textContent = "Instalador do VetFinance liberado para download.";
    installerMessage.classList.remove("error");
  } catch (error) {
    installerMessage.textContent = error.message;
    installerMessage.classList.add("error");
  }
});

logoutButton.addEventListener("click", showLoginForm);

refreshInstallerStatus();
