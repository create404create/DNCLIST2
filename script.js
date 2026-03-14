// Global variables
let results = [];
let filteredResults = [];
let currentFilter = 'all';
let processing = false;
let failedNumbers = [];
let pieChart, stateChart;
let currentNumbers = [];
let processingInterval;
let currentIndex = 0;
let speedDelay = 3000; // 3 seconds
let activeJsonpRequests = 0;

// APIs
const TCPA_API = 'https://api.uspeoplesearch.site/tcpa/v1?x=';
const PERSON_API = 'https://api.uspeoplesearch.site/v1/?x=';

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadLastSession();
    initializeEventListeners();
    initializeKeyboardShortcuts();
    initializeSpeedSlider();
});

// Initialize speed slider
function initializeSpeedSlider() {
    const slider = document.getElementById('speedSlider');
    const valueDisplay = document.getElementById('speedValue');
    
    if (slider) {
        slider.value = 3000;
        valueDisplay.textContent = '3.0 seconds';
        
        slider.addEventListener('input', function() {
            speedDelay = parseInt(this.value);
            const seconds = (speedDelay / 1000).toFixed(1);
            valueDisplay.textContent = `${seconds} seconds`;
        });
    }
}

// Initialize event listeners
function initializeEventListeners() {
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    const dragDropArea = document.getElementById('dragDropArea');
    const fileInput = document.getElementById('fileInput');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dragDropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dragDropArea.addEventListener(eventName, () => {
            dragDropArea.classList.add('dragover');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dragDropArea.addEventListener(eventName, () => {
            dragDropArea.classList.remove('dragover');
        });
    });
    
    dragDropArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    document.getElementById('startProcessingBtn').addEventListener('click', startProcessing);
    document.getElementById('cancelProcessingBtn').addEventListener('click', cancelProcessing);
    
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', handleFilterClick);
    });
    
    document.getElementById('searchInput').addEventListener('input', applyFilter);
    
    document.getElementById('downloadCleanBtn').addEventListener('click', downloadCleanNumbers);
    document.getElementById('downloadDncBtn').addEventListener('click', downloadDncNumbers);
    document.getElementById('downloadExcelBtn').addEventListener('click', downloadExcel);
    document.getElementById('downloadJsonBtn').addEventListener('click', downloadJson);
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadPdf);
    document.getElementById('clearResultsBtn').addEventListener('click', clearResults);
    document.getElementById('retryFailedBtn').addEventListener('click', retryFailed);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const icon = document.querySelector('.theme-toggle i');
    const text = document.querySelector('.theme-toggle span');
    
    if (document.body.classList.contains('dark-mode')) {
        icon.className = 'fas fa-moon';
        text.textContent = 'Light Mode';
        localStorage.setItem('theme', 'dark');
    } else {
        icon.className = 'fas fa-sun';
        text.textContent = 'Dark Mode';
        localStorage.setItem('theme', 'light');
    }
    
    if (results.length > 0) updateCharts();
}

function loadLastSession() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.querySelector('.theme-toggle i').className = 'fas fa-moon';
        document.querySelector('.theme-toggle span').textContent = 'Light Mode';
    }
    
    const lastResults = localStorage.getItem('lastResults');
    if (lastResults) {
        try {
            results = JSON.parse(lastResults);
            results.forEach(result => addResultToTable(result));
            updateStats();
            enableDownloadButtons();
            updateCharts();
            updateStateButtons();
            showToast('Previous session loaded', 'info');
        } catch (error) {
            console.error('Error loading session:', error);
        }
    }
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    document.getElementById('fileInput').files = dt.files;
    handleFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    handleFile(file);
}

async function handleFile(file) {
    if (!file) return;
    
    if (!file.name.match(/\.(txt|csv)$/)) {
        showToast('Please upload a .txt or .csv file', 'error');
        return;
    }

    try {
        const text = await file.text();
        const numbers = text.split('\n')
            .map(line => line.trim())
            .filter(line => {
                if (!line) return false;
                const cleanNumber = line.replace(/\D/g, '');
                return cleanNumber.length === 10;
            })
            .map(line => line.replace(/\D/g, ''));

        if (numbers.length === 0) {
            showToast('No valid 10-digit numbers found in file', 'error');
            return;
        }

        currentNumbers = numbers;
        showFilePreview(file.name, numbers);
        document.getElementById('controlPanel').style.display = 'block';
        showToast(`Loaded ${numbers.length} numbers. Click Start to begin.`, 'success');
        
    } catch (error) {
        console.error('Error reading file:', error);
        showToast('Error reading file', 'error');
    }
}

function showFilePreview(fileName, numbers) {
    const preview = document.getElementById('filePreview');
    const fileNameSpan = document.getElementById('fileName');
    const fileCount = document.getElementById('fileCount');
    const previewNumbers = document.getElementById('previewNumbers');
    
    fileNameSpan.textContent = fileName;
    fileCount.textContent = `${numbers.length} numbers`;
    fileCount.className = numbers.length > 100 ? 'badge warning' : 'badge success';
    
    const previewList = numbers.slice(0, 10).map(n => n).join('<br>');
    const moreText = numbers.length > 10 ? `<br>... and ${numbers.length - 10} more` : '';
    previewNumbers.innerHTML = previewList + moreText;
    
    preview.style.display = 'block';
}

function startProcessing() {
    if (processing) {
        showToast('Already processing', 'warning');
        return;
    }
    
    if (!currentNumbers || currentNumbers.length === 0) {
        showToast('Please upload a file first', 'error');
        return;
    }
    
    results = [];
    failedNumbers = [];
    currentIndex = 0;
    
    document.getElementById('resultsBody').innerHTML = '';
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('startProcessingBtn').style.display = 'none';
    document.getElementById('cancelProcessingBtn').style.display = 'inline-flex';
    
    processing = true;
    showToast(`Processing ${currentNumbers.length} numbers...`, 'info');
    processNextNumber();
}

function cancelProcessing() {
    processing = false;
    clearTimeout(processingInterval);
    
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('startProcessingBtn').style.display = 'inline-flex';
    document.getElementById('cancelProcessingBtn').style.display = 'none';
    
    showToast('Processing cancelled', 'warning');
}

// JSONP Function - YEH MAIN MAGIC HAI!
function jsonpRequest(url, callbackName, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const callbackFunc = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Create unique callback name
        window[callbackFunc] = function(data) {
            cleanup();
            resolve(data);
        };
        
        const cleanup = () => {
            if (window[callbackFunc]) delete window[callbackFunc];
            if (script.parentNode) document.body.removeChild(script);
            clearTimeout(timeoutId);
        };
        
        script.src = `${url}&callback=${callbackFunc}`;
        script.onerror = () => {
            cleanup();
            reject(new Error('JSONP request failed'));
        };
        
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Request timeout'));
        }, timeout);
        
        document.body.appendChild(script);
    });
}

// Process number with JSONP
async function processNumberWithJSONP(number) {
    try {
        // TCPA API call
        const tcpaUrl = `${TCPA_API}${number}`;
        console.log('Fetching TCPA data for:', number);
        
        const tcpaData = await jsonpRequest(tcpaUrl, 'jsonp_callback', 15000);
        console.log('TCPA Response:', tcpaData);
        
        let personData = null;
        
        // If clean, get person data
        if (tcpaData.listed === 'No') {
            try {
                const personUrl = `${PERSON_API}${number}`;
                console.log('Fetching person data for:', number);
                personData = await jsonpRequest(personUrl, 'jsonp_callback', 10000);
                console.log('Person Response:', personData);
            } catch (personError) {
                console.log('Person API error (non-critical):', personError);
            }
        }
        
        return {
            phone: number,
            status: tcpaData.listed === 'No' ? 'Clean' : 'DNC',
            listed: tcpaData.listed || 'No',
            type: tcpaData.type || 'No',
            state: tcpaData.state || 'Unknown',
            ndnc: tcpaData.ndnc || 'No',
            sdnc: tcpaData.sdnc || 'No',
            person: personData,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('JSONP failed for', number, error);
        throw error;
    }
}

// Process next number
async function processNextNumber() {
    if (!processing || currentIndex >= currentNumbers.length) {
        finishProcessing();
        return;
    }
    
    const number = currentNumbers[currentIndex];
    
    try {
        const progress = ((currentIndex + 1) / currentNumbers.length) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;
        document.getElementById('progressPercentage').textContent = `${Math.round(progress)}%`;
        document.getElementById('progressDetail').textContent = `Processing ${currentIndex + 1}/${currentNumbers.length}: ${number}`;
        
        const result = await processNumberWithJSONP(number);
        results.push(result);
        addResultToTable(result);
        
    } catch (error) {
        console.error('Error processing number:', number, error);
        const errorResult = {
            phone: number,
            status: 'Error',
            listed: 'Error',
            type: 'Error',
            state: 'Error',
            ndnc: 'Error',
            sdnc: 'Error',
            person: null,
            error: error.message,
            timestamp: new Date().toISOString()
        };
        results.push(errorResult);
        failedNumbers.push(number);
        addResultToTable(errorResult);
    }
    
    updateStats();
    currentIndex++;
    
    if (processing) {
        processingInterval = setTimeout(processNextNumber, speedDelay);
    }
}

function finishProcessing() {
    processing = false;
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('startProcessingBtn').style.display = 'inline-flex';
    document.getElementById('cancelProcessingBtn').style.display = 'none';
    
    enableDownloadButtons();
    updateCharts();
    updateStateButtons();
    
    localStorage.setItem('lastResults', JSON.stringify(results));
    
    const successCount = results.filter(r => r.status !== 'Error').length;
    showToast(`Processing complete! ${successCount}/${results.length} successful`, 'success');
    
    if (failedNumbers.length > 0) {
        document.getElementById('retryFailedBtn').style.display = 'inline-flex';
        showToast(`${failedNumbers.length} numbers failed. Click retry to process again.`, 'warning');
    }
}

function addResultToTable(result) {
    const tbody = document.getElementById('resultsBody');
    
    if (tbody.children.length === 1 && tbody.children[0].classList.contains('no-data')) {
        tbody.innerHTML = '';
    }
    
    const row = document.createElement('tr');
    row.dataset.phone = result.phone;
    row.dataset.status = result.status;
    row.dataset.state = result.state;
    
    const statusClass = result.status === 'Clean' ? 'badge clean' : 
                      result.status === 'DNC' ? 'badge dnc' : 'badge error';
    
    const ndncBadge = result.ndnc === 'Yes' ? '<span class="badge ndnc">NDNC</span>' : '<span class="badge clean">No</span>';
    const sdncBadge = result.sdnc === 'Yes' ? '<span class="badge sdnc">SDNC</span>' : '<span class="badge clean">No</span>';
    
    let personInfo = '-';
    if (result.person && result.person.person && result.person.person.length > 0) {
        const person = result.person.person[0];
        personInfo = `<button class="btn btn-info btn-sm" onclick='showPersonDetails(${JSON.stringify(person).replace(/'/g, "\\'")})'>
            <i class="fas fa-user"></i> View
        </button>`;
    }
    
    row.innerHTML = `
        <td>${result.phone}</td>
        <td><span class="${statusClass}">${result.status}</span></td>
        <td>${result.listed}</td>
        <td>${result.type}</td>
        <td>${result.state}</td>
        <td>${ndncBadge}</td>
        <td>${sdncBadge}</td>
        <td>${personInfo}</td>
        <td>
            <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${result.phone}')">
                <i class="fas fa-copy"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
}

function updateStats() {
    const total = results.length;
    const clean = results.filter(r => r.status === 'Clean').length;
    const dnc = results.filter(r => r.status === 'DNC').length;
    const error = results.filter(r => r.status === 'Error').length;
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('cleanCount').textContent = clean;
    document.getElementById('dncCount').textContent = dnc;
    document.getElementById('errorCount').textContent = error;
}

function enableDownloadButtons() {
    const hasClean = results.some(r => r.status === 'Clean');
    const hasDNC = results.some(r => r.status === 'DNC');
    
    document.getElementById('downloadCleanBtn').disabled = !hasClean;
    document.getElementById('downloadDncBtn').disabled = !hasDNC;
    document.getElementById('downloadExcelBtn').disabled = results.length === 0;
    document.getElementById('downloadJsonBtn').disabled = results.length === 0;
    document.getElementById('downloadPdfBtn').disabled = results.length === 0;
}

function updateStateButtons() {
    const stateButtons = document.getElementById('stateButtons');
    const stateDownloadSection = document.getElementById('stateDownloadSection');
    
    if (!stateButtons || !stateDownloadSection) return;
    
    const states = {};
    results.forEach(r => {
        if (r.state && r.state !== 'Error' && r.state !== 'Unknown') {
            if (!states[r.state]) {
                states[r.state] = { clean: 0, dnc: 0, total: 0 };
            }
            if (r.status === 'Clean') states[r.state].clean++;
            if (r.status === 'DNC') states[r.state].dnc++;
            states[r.state].total++;
        }
    });
    
    const stateKeys = Object.keys(states);
    
    if (stateKeys.length > 0) {
        stateDownloadSection.style.display = 'block';
        stateButtons.innerHTML = '';
        
        stateKeys.sort().forEach(state => {
            const btn = document.createElement('button');
            btn.className = 'state-btn';
            btn.innerHTML = `<i class="fas fa-download"></i> ${state} (C:${states[state].clean}/D:${states[state].dnc})`;
            btn.onclick = () => downloadStateNumbers(state);
            stateButtons.appendChild(btn);
        });
    } else {
        stateDownloadSection.style.display = 'none';
    }
}

function downloadStateNumbers(state) {
    const stateNumbers = results.filter(r => r.state === state).map(r => r.phone);
    downloadFile(stateNumbers.join('\n'), `${state}_numbers.txt`);
    showToast(`Downloaded ${stateNumbers.length} numbers from ${state}`, 'success');
}

function downloadCleanNumbers() {
    const cleanNumbers = results.filter(r => r.status === 'Clean').map(r => r.phone);
    downloadFile(cleanNumbers.join('\n'), 'clean_numbers.txt');
    showToast('Clean numbers downloaded', 'success');
}

function downloadDncNumbers() {
    const dncNumbers = results.filter(r => r.status === 'DNC').map(r => r.phone);
    downloadFile(dncNumbers.join('\n'), 'dnc_numbers.txt');
    showToast('DNC numbers downloaded', 'success');
}

function downloadExcel() {
    const exportData = results.map(r => ({
        'Phone Number': r.phone,
        'Status': r.status,
        'Listed': r.listed,
        'Type': r.type,
        'State': r.state,
        'NDNC': r.ndnc,
        'SDNC': r.sdnc
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'dnc_check_results.xlsx');
    showToast('Excel file downloaded', 'success');
}

function downloadJson() {
    const jsonStr = JSON.stringify(results, null, 2);
    downloadFile(jsonStr, 'dnc_check_results.json');
    showToast('JSON file downloaded', 'success');
}

function downloadPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('DNC Check Results', 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Total Numbers: ${results.length}`, 20, 35);
    doc.text(`Clean Numbers: ${results.filter(r => r.status === 'Clean').length}`, 20, 45);
    doc.text(`DNC Numbers: ${results.filter(r => r.status === 'DNC').length}`, 20, 55);
    doc.text(`Errors: ${results.filter(r => r.status === 'Error').length}`, 20, 65);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 75);
    
    let yPos = 85;
    doc.setFontSize(10);
    results.slice(0, 20).forEach((r, i) => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
        }
        doc.text(`${i+1}. ${r.phone} - ${r.status} - ${r.state}`, 20, yPos);
        yPos += 7;
    });
    
    if (results.length > 20) {
        doc.text(`... and ${results.length - 20} more numbers`, 20, yPos);
    }
    
    doc.save('dnc_check_report.pdf');
    showToast('PDF report downloaded', 'success');
}

function clearResults() {
    if (processing) {
        cancelProcessing();
    }
    
    results = [];
    filteredResults = [];
    failedNumbers = [];
    currentNumbers = [];
    
    document.getElementById('resultsBody').innerHTML = `
        <tr>
            <td colspan="9" class="no-data">
                <i class="fas fa-upload" style="font-size: 3rem; margin-bottom: 15px; display: block;"></i>
                Upload a file to start checking numbers
            </td>
        </tr>
    `;
    
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('controlPanel').style.display = 'none';
    document.getElementById('stateDownloadSection').style.display = 'none';
    
    updateStats();
    enableDownloadButtons();
    
    if (pieChart) pieChart.destroy();
    if (stateChart) stateChart.destroy();
    
    localStorage.removeItem('lastResults');
    document.getElementById('retryFailedBtn').style.display = 'none';
    
    showToast('Results cleared', 'success');
}

function retryFailed() {
    if (failedNumbers.length > 0 && !processing) {
        currentNumbers = [...failedNumbers];
        currentIndex = 0;
        results = results.filter(r => !failedNumbers.includes(r.phone));
        failedNumbers = [];
        
        startProcessing();
        document.getElementById('retryFailedBtn').style.display = 'none';
    }
}

function handleFilterClick(e) {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.filter;
    applyFilter();
}

function applyFilter() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    filteredResults = results.filter(r => {
        if (currentFilter !== 'all' && r.status.toLowerCase() !== currentFilter) {
            return false;
        }
        if (searchTerm) {
            return r.phone.includes(searchTerm) || 
                   (r.state && r.state.toLowerCase().includes(searchTerm));
        }
        return true;
    });
    
    renderFilteredResults();
}

function renderFilteredResults() {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    
    if (filteredResults.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="no-data">
                    <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 15px; display: block;"></i>
                    No results match your filter
                </td>
            </tr>
        `;
        return;
    }
    
    filteredResults.forEach(result => addResultToTable(result));
}

function sortTable(columnIndex) {
    const tbody = document.getElementById('resultsBody');
    const rows = Array.from(tbody.children);
    
    const sorted = rows.sort((a, b) => {
        const aVal = a.children[columnIndex].textContent;
        const bVal = b.children[columnIndex].textContent;
        return aVal.localeCompare(bVal);
    });
    
    tbody.innerHTML = '';
    sorted.forEach(row => tbody.appendChild(row));
}

function updateCharts() {
    const clean = results.filter(r => r.status === 'Clean').length;
    const dnc = results.filter(r => r.status === 'DNC').length;
    const error = results.filter(r => r.status === 'Error').length;
    
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary');
    
    const pieCtx = document.getElementById('dncPieChart').getContext('2d');
    if (pieChart) pieChart.destroy();
    
    pieChart = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: ['Clean', 'DNC', 'Error'],
            datasets: [{
                data: [clean, dnc, error],
                backgroundColor: ['#10b981', '#ef4444', '#f59e0b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textColor }
                }
            }
        }
    });
    
    const stateCounts = {};
    results.forEach(r => {
        if (r.state && r.state !== 'Error' && r.state !== 'Unknown') {
            stateCounts[r.state] = (stateCounts[r.state] || 0) + 1;
        }
    });
    
    const stateCtx = document.getElementById('stateChart').getContext('2d');
    if (stateChart) stateChart.destroy();
    
    if (Object.keys(stateCounts).length > 0) {
        stateChart = new Chart(stateCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(stateCounts),
                datasets: [{
                    label: 'Numbers by State',
                    data: Object.values(stateCounts),
                    backgroundColor: '#667eea'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor }
                    }
                },
                scales: {
                    y: {
                        ticks: { color: textColor }
                    },
                    x: {
                        ticks: { color: textColor }
                    }
                }
            }
        });
    }
}

function showPersonDetails(person) {
    const modal = document.getElementById('personModal');
    const details = document.getElementById('personDetails');
    
    let html = '<div class="person-info">';
    html += `<p><strong>Name:</strong> ${person.name || 'N/A'}</p>`;
    html += `<p><strong>Status:</strong> ${person.status || 'N/A'}</p>`;
    html += `<p><strong>Age:</strong> ${person.age || 'N/A'}</p>`;
    html += `<p><strong>Date of Birth:</strong> ${person.dob || 'N/A'}</p>`;
    
    if (person.addresses && person.addresses.length > 0) {
        html += '<p><strong>Addresses:</strong></p><ul>';
        person.addresses.forEach(addr => {
            html += `<li>${addr.home || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip || ''} - ${addr.isDeliverable || ''}</li>`;
        });
        html += '</ul>';
    }
    
    if (person.relatives && person.relatives.length > 0) {
        html += '<p><strong>Relatives:</strong></p><ul>';
        person.relatives.forEach(rel => {
            if (rel !== 'Not Found') {
                html += `<li>${rel}</li>`;
            }
        });
        html += '</ul>';
    }
    
    html += '</div>';
    
    details.innerHTML = html;
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('personModal').classList.remove('active');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Number copied to clipboard!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Number copied to clipboard!', 'success');
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    toast.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'v') {
            e.preventDefault();
            navigator.clipboard.readText().then(text => {
                const numbers = text.split('\n')
                    .map(line => line.trim())
                    .filter(line => {
                        if (!line) return false;
                        const cleanNumber = line.replace(/\D/g, '');
                        return cleanNumber.length === 10;
                    })
                    .map(line => line.replace(/\D/g, ''));
                
                if (numbers.length > 0) {
                    currentNumbers = numbers;
                    showFilePreview('Pasted Numbers', numbers);
                    document.getElementById('controlPanel').style.display = 'block';
                    showToast(`Loaded ${numbers.length} pasted numbers`, 'success');
                } else {
                    showToast('No valid numbers found in clipboard', 'warning');
                }
            });
        }
        
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (results.length > 0) {
                downloadFile(JSON.stringify(results, null, 2), 'results_backup.json');
                showToast('Results saved', 'success');
            }
        }
    });
}

window.addEventListener('beforeunload', () => {
    if (results.length > 0) {
        localStorage.setItem('lastResults', JSON.stringify(results));
    }
});

window.sortTable = sortTable;
window.showPersonDetails = showPersonDetails;
window.closeModal = closeModal;
window.copyToClipboard = copyToClipboard;
