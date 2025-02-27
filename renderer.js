const { ipcRenderer } = require('electron');
const videoElement = document.getElementById('preview');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const refreshSourcesBtn = document.getElementById('refreshSourcesBtn');
const sourceThumbnails = document.getElementById('source-thumbnails');
const monitorsDropdown = document.getElementById('monitorsDropdown');
const statusElement = document.getElementById('status');
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

let mediaRecorder;
let recordedChunks = [];
let stream;
let selectedSource = null;
let selectedMonitor = null;
let windowSources = [];
let monitors = [];

// Tab switching functionality
tabs.forEach(tab => {
	tab.addEventListener('click', () => {
		// Remove active class from all tabs
		tabs.forEach(t => t.classList.remove('active'));

		// Add active class to clicked tab
		tab.classList.add('active');

		// Hide all tab contents
		tabContents.forEach(content => content.classList.add('hidden'));

		// Show selected tab content
		const tabName = tab.dataset.tab;
		document.getElementById(`${tabName}-tab`).classList.remove('hidden');

		// Reset selection
		if (tabName === 'monitors') {
			selectedSource = null;
			if (selectedMonitor) {
				setupStreamForMonitor(selectedMonitor);
			} else {
				startBtn.disabled = true;
			}
		} else {
			selectedMonitor = null;
			if (selectedSource) {
				setupStreamForSource(selectedSource.id);
			} else {
				startBtn.disabled = true;
			}
		}
	});
});

// Get available monitors
async function getMonitors() {
	try {
		setStatus('Loading monitors...');
		monitorsDropdown.innerHTML = '<option value="screen">Entire Screen</option>';

		monitors = await ipcRenderer.invoke('get-monitors');

		if (monitors.length === 0) {
			setStatus('No monitors found');
			return;
		}

		monitors.forEach(monitor => {
			const option = document.createElement('option');
			option.value = monitor.id;
			option.textContent = `${monitor.name} (${monitor.size.width}x${monitor.size.height})`;
			if (monitor.isPrimary) {
				option.textContent += ' - Primary';
			}
			monitorsDropdown.appendChild(option);
		});

		setStatus('Select a monitor to record');
	} catch (error) {
		console.error('Error getting monitors:', error);
		setStatus('Error: Could not get monitors. ' + error.message);
	}
}

// Get available window sources
async function getWindowSources() {
	try {
		setStatus('Loading available windows...');
		sourceThumbnails.innerHTML = '';

		const sources = await ipcRenderer.invoke('get-sources');
		windowSources = sources.filter(source => source.id.includes('window'));

		if (windowSources.length === 0) {
			sourceThumbnails.innerHTML = '<div class="no-sources">No window sources found</div>';
			setStatus('No window sources found');
			return;
		}

		windowSources.forEach(source => {
			const sourceItem = document.createElement('div');
			sourceItem.className = 'source-item';
			sourceItem.dataset.id = source.id;
			sourceItem.dataset.name = source.name;

			// Create thumbnail image
			const thumbnailImg = document.createElement('img');
			thumbnailImg.className = 'source-thumbnail';
			thumbnailImg.src = source.thumbnail.toDataURL();

			// Create name label
			const nameDiv = document.createElement('div');
			nameDiv.className = 'source-name';
			nameDiv.textContent = source.name;

			// Add to container
			sourceItem.appendChild(thumbnailImg);
			sourceItem.appendChild(nameDiv);
			sourceThumbnails.appendChild(sourceItem);

			// Add click handler
			sourceItem.addEventListener('click', () => {
				selectWindowSource(source);
			});
		});

		setStatus('Select a window to record');
	} catch (error) {
		console.error('Error getting window sources:', error);
		setStatus('Error: Could not get window sources. ' + error.message);
	}
}

// Select a window source for recording
function selectWindowSource(source) {
	// Remove selected class from all sources
	document.querySelectorAll('.source-item').forEach(item => {
		item.classList.remove('selected');
	});

	// Add selected class to clicked source
	const selectedElement = document.querySelector(`.source-item[data-id="${source.id}"]`);
	if (selectedElement) {
		selectedElement.classList.add('selected');
	}

	selectedSource = source;
	selectedMonitor = null;
	setStatus(`Selected: ${source.name}`);

	// Enable the start button
	startBtn.disabled = false;

	// Preview the selected source
	setupStreamForSource(source.id);
}

// Set up video stream for the selected window source
async function setupStreamForSource(sourceId) {
	try {
		if (stream) {
			stream.getTracks().forEach(track => track.stop());
		}

		const constraints = {
			audio: false,
			video: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: sourceId
				}
			}
		};

		stream = await navigator.mediaDevices.getUserMedia(constraints);
		videoElement.srcObject = stream;
	} catch (error) {
		console.error('Error accessing media devices:', error);
		setStatus('Error: Could not access screen capture. ' + error.message);
	}
}

// Set up video stream for the selected monitor
async function setupStreamForMonitor(monitorId) {
	try {
		if (stream) {
			stream.getTracks().forEach(track => track.stop());
		}

		// First get all screen sources
		const sources = await ipcRenderer.invoke('get-sources');
		const screenSources = sources.filter(source => source.id.includes('screen'));

		// Find the monitor in our list
		const monitor = monitors.find(m => m.id === monitorId);
		if (!monitor) {
			setStatus('Error: Monitor not found');
			return;
		}

		// For now, we'll use the first screen source as it typically represents the entire desktop
		// In a more advanced implementation, you could try to match the monitor dimensions
		if (screenSources.length > 0) {
			const sourceId = screenSources[0].id;

			const constraints = {
				audio: false,
				video: {
					mandatory: {
						chromeMediaSource: 'desktop',
						chromeMediaSourceId: sourceId
					}
				}
			};

			stream = await navigator.mediaDevices.getUserMedia(constraints);
			videoElement.srcObject = stream;

			setStatus(`Ready to record ${monitor.name}`);
		} else {
			setStatus('Error: No screen sources available');
		}
	} catch (error) {
		console.error('Error accessing media devices:', error);
		setStatus('Error: Could not access screen capture. ' + error.message);
	}
}

function setStatus(message) {
	statusElement.textContent = message;
}

// Monitor dropdown change handler
monitorsDropdown.addEventListener('change', () => {
	const monitorId = parseInt(monitorsDropdown.value);
	const monitor = monitors.find(m => m.id === monitorId);

	if (monitor) {
		selectedMonitor = monitorId;
		selectedSource = null;
		setStatus(`Selected: ${monitor.name}`);
		startBtn.disabled = false;
		setupStreamForMonitor(monitorId);
	} else {
		selectedMonitor = null;
		startBtn.disabled = true;
		setStatus('Please select a monitor');
	}
});

// Start recording
startBtn.addEventListener('click', () => {
	if (!selectedSource && !selectedMonitor) {
		setStatus('Please select a source first');
		return;
	}

	if (!stream) {
		setStatus('No stream available. Please try selecting a source again.');
		return;
	}

	recordedChunks = [];

	const options = { mimeType: 'video/webm; codecs=vp9' };
	mediaRecorder = new MediaRecorder(stream, options);

	mediaRecorder.ondataavailable = (e) => {
		if (e.data.size > 0) {
			recordedChunks.push(e.data);
		}
	};

	mediaRecorder.onstop = () => {
		const blob = new Blob(recordedChunks, {
			type: 'video/webm'
		});

		// Convert blob to buffer to send to main process
		const reader = new FileReader();
		reader.onload = () => {
			const buffer = new Uint8Array(reader.result);
			ipcRenderer.send('stop-recording', buffer);
		};
		reader.readAsArrayBuffer(blob);
	};

	mediaRecorder.start();
	ipcRenderer.send('start-recording');
});

// Stop recording
stopBtn.addEventListener('click', () => {
	if (mediaRecorder && mediaRecorder.state !== 'inactive') {
		mediaRecorder.stop();
		setStatus('Processing recording...');
	}
});

// Refresh sources
refreshSourcesBtn.addEventListener('click', () => {
	getMonitors();
	getWindowSources();
});

// Handle recording status changes
ipcRenderer.on('recording-status', (event, isRecording) => {
	startBtn.disabled = isRecording;
	stopBtn.disabled = !isRecording;
	refreshSourcesBtn.disabled = isRecording;
	monitorsDropdown.disabled = isRecording;

	// Disable tabs during recording
	tabs.forEach(tab => {
		tab.disabled = isRecording;
	});

	// Disable source selection during recording
	document.querySelectorAll('.source-item').forEach(item => {
		item.style.pointerEvents = isRecording ? 'none' : 'auto';
		item.style.opacity = isRecording ? '0.5' : '1';
	});

	if (isRecording) {
		if (selectedSource) {
			setStatus(`Recording ${selectedSource.name}...`);
		} else if (selectedMonitor) {
			const monitor = monitors.find(m => m.id === selectedMonitor);
			setStatus(`Recording ${monitor ? monitor.name : 'monitor'}...`);
		} else {
			setStatus('Recording...');
		}
	} else {
		setStatus('Recording stopped');
	}
});

// Handle save status
ipcRenderer.on('save-status', (event, result) => {
	if (result.success) {
		setStatus(`Recording saved to: ${result.filePath}`);
	} else {
		setStatus(`Error: ${result.message}`);
	}
});

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
	getMonitors();
	getWindowSources();
});