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

            base.OnStartup(e);
        }

        protected override void OnExit(ExitEventArgs e)
        {
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
