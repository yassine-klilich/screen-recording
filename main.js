const { app, BrowserWindow, ipcMain, Menu, dialog, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			enableRemoteModule: true
		}
	});

	mainWindow.loadFile('index.html');

	// Open DevTools for debugging (optional)
	// mainWindow.webContents.openDevTools();

	mainWindow.on('closed', () => {
		mainWindow = null;
	});

	const menu = Menu.buildFromTemplate([
		{
			label: 'File',
			submenu: [
				{
					label: 'Exit',
					click() {
						app.quit();
					}
				}
			]
		}
	]);

	Menu.setApplicationMenu(menu);
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow();
	}
});

// Handle get sources request from renderer
ipcMain.handle('get-sources', async () => {
	const sources = await desktopCapturer.getSources({
		types: ['screen', 'window'],
		thumbnailSize: { width: 150, height: 150 }
	});
	return sources;
});

// Handle get monitors request from renderer
ipcMain.handle('get-monitors', () => {
	const displays = screen.getAllDisplays();
	const primaryDisplay = screen.getPrimaryDisplay();

	// Format display info
	const monitors = displays.map(display => {
		return {
			id: display.id,
			name: display.id === primaryDisplay.id ?
				`Display ${display.id} (Primary)` :
				`Display ${display.id}`,
			bounds: display.bounds,
			isPrimary: display.id === primaryDisplay.id,
			size: {
				width: display.size.width,
				height: display.size.height
			},
			workArea: display.workArea,
			scaleFactor: display.scaleFactor
		};
	});

	return monitors;
});

// Handle start recording message from renderer
ipcMain.on('start-recording', (event) => {
	mainWindow.webContents.send('recording-status', true);
});

// Handle stop recording message from renderer
ipcMain.on('stop-recording', (event, buffer) => {
	dialog.showSaveDialog(mainWindow, {
		title: 'Save recording',
		defaultPath: path.join(app.getPath('videos'), 'recording.mp4'),
		filters: [{ name: 'Movies', extensions: ['mp4'] }]
	}).then(result => {
		if (!result.canceled && result.filePath) {
			fs.writeFile(result.filePath, Buffer.from(buffer), (err) => {
				if (err) {
					console.error('Failed to save recording:', err);
					mainWindow.webContents.send('save-status', {
						success: false,
						message: 'Failed to save recording'
					});
				} else {
					mainWindow.webContents.send('save-status', {
						success: true,
						message: 'Recording saved successfully',
						filePath: result.filePath
					});
				}
			});
		}
	}).catch(err => {
		console.error(err);
	});

	mainWindow.webContents.send('recording-status', false);
});