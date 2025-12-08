using System;
using System.Configuration;
using System.Data;
using System.Windows;
using System.Threading;

namespace desktopdrawing
{
    /// <summary>
    /// Interaction logic for App.xaml
    /// </summary>
    public partial class App : Application
    {
        private const string MutexName = "desktopdrawing_singleton_mutex";
        private static Mutex? mutex = null;
        private DrawingServer? _drawingServer;

        /// <summary>
        /// Get the drawing server instance (accessible from MainWindow)
        /// </summary>
        public static DrawingServer? DrawingServer => ((App)Current)._drawingServer;

        protected override void OnStartup(StartupEventArgs e)
        {
            // Try to create a named mutex
            bool createdNew;
            mutex = new Mutex(true, MutexName, out createdNew);

            if (!createdNew)
            {
                // Another instance is already running
                // Try to bring the existing window to the front
                BringExistingWindowToFront();
                
                // Exit this instance
                Shutdown();
                return;
            }

            // Start the local HTTP server for drawing coordinates
            try
            {
                _drawingServer = new DrawingServer(port: 8888);
                _drawingServer.Start();
            }
            catch (Exception ex)
            {
                // Log error but don't prevent app from starting
                System.Diagnostics.Debug.WriteLine($"[App] Failed to start drawing server: {ex.Message}");
            }

            base.OnStartup(e);
        }

        protected override void OnExit(ExitEventArgs e)
        {
            // Stop the drawing server
            try
            {
                _drawingServer?.Stop();
                _drawingServer?.Dispose();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Error stopping drawing server: {ex.Message}");
            }

            // Release the mutex when the application exits
            mutex?.ReleaseMutex();
            mutex?.Dispose();
            base.OnExit(e);
        }

        private void BringExistingWindowToFront()
        {
            // Try to find and activate the existing window
            // This is a simple approach - you might want to use IPC for more sophisticated communication
            try
            {
                // Use Windows API to find and bring the window to front
                var currentProcess = System.Diagnostics.Process.GetCurrentProcess();
                var processes = System.Diagnostics.Process.GetProcessesByName(currentProcess.ProcessName);
                
                foreach (var process in processes)
                {
                    if (process.Id != currentProcess.Id)
                    {
                        // Try to bring the window to front
                        NativeMethods.SetForegroundWindow(process.MainWindowHandle);
                        NativeMethods.ShowWindow(process.MainWindowHandle, NativeMethods.SW_RESTORE);
                        break;
                    }
                }
            }
            catch
            {
                // If we can't bring it to front, just exit silently
            }
        }
    }

    // Helper class for Windows API calls
    internal static class NativeMethods
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        internal static extern bool SetForegroundWindow(System.IntPtr hWnd);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        internal static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);

        internal const int SW_RESTORE = 9;
    }
}
