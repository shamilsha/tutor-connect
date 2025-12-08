using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using desktopdrawing;

namespace ScreenAnnotator
{
    public partial class MainWindow : Window
    {
        private Polyline? currentStroke;
        private bool isDrawing = false;

        // This now tracks the requested state, similar to before.
        private bool isDrawingMode = true;

        // For coordinate collection and sending
        private string? currentStrokeId;
        private DateTime lastSendTime = DateTime.MinValue;
        private const int SendThrottleMs = 16; // ~60fps max

        public MainWindow()
        {
            InitializeComponent();
            // Initialize icon to match initial drawing mode state
            UpdateModeToggleIcon(isDrawingMode: true);
        }

        // --- Core Drawing Logic ---

        private void DrawingCanvas_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (isDrawingMode && e.LeftButton == MouseButtonState.Pressed)
            {
                isDrawing = true;

                // Generate unique stroke ID
                currentStrokeId = Guid.NewGuid().ToString();

                currentStroke = new Polyline()
                {
                    Stroke = Brushes.Black,
                    StrokeThickness = 5,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    StrokeLineJoin = PenLineJoin.Round
                };

                var point = e.GetPosition(DrawingCanvas);
                currentStroke.Points.Add(point);
                DrawingCanvas.Children.Add(currentStroke);

                // Send start of stroke
                SendDrawingPoint(point, isStart: true);
            }
        }

        private void DrawingCanvas_MouseMove(object sender, MouseEventArgs e)
        {
            if (isDrawing && currentStroke != null)
            {
                var point = e.GetPosition(DrawingCanvas);
                currentStroke.Points.Add(point);

                // Send coordinate update (throttled)
                SendDrawingPoint(point, isStart: false);
            }
        }

        private void DrawingCanvas_MouseUp(object sender, MouseButtonEventArgs e)
        {
            if (isDrawing && currentStroke != null)
            {
                var point = e.GetPosition(DrawingCanvas);
                // Send final point
                SendDrawingPoint(point, isStart: false, isEnd: true);
            }

            isDrawing = false;
            currentStrokeId = null;
        }

        // --- Mode Toggle Logic ---

        private void ToggleInteractivity(object sender, RoutedEventArgs e)
        {
            isDrawingMode = !isDrawingMode;

            if (isDrawingMode)
            {
                // 🎨 Drawing Mode: Full screen is pink and clickable for drawing.

                // 1. Window must be hit-test visible so the full screen drawing canvas can work.
                AnnotatorWindow.IsHitTestVisible = true;

                // 2. Drawing Canvas is visible and active.
                DrawingCanvas.Background = new SolidColorBrush(Color.FromArgb(0x80, 0xFF, 0xC0, 0xCB));
                DrawingCanvas.IsHitTestVisible = true;

                // 3. Update Icon to Pencil (drawing mode)
                UpdateModeToggleIcon(isDrawingMode: true);
            }
            else
            {
                // 🖥️ Interactive Mode: Only the button area is clickable.

                // 1. Window remains hit-test visible. This is KEY to keeping the button clickable.
                AnnotatorWindow.IsHitTestVisible = true;

                // 2. Drawing Canvas goes fully transparent and disables hit testing.
                // This is what allows interaction with the rest of the screen.
                DrawingCanvas.Background = Brushes.Transparent;
                DrawingCanvas.IsHitTestVisible = false;

                // 3. Update Icon to Hand (interactive mode)
                UpdateModeToggleIcon(isDrawingMode: false);
            }
        }

        /// <summary>
        /// Update the mode toggle button icon (Pencil for drawing, Hand for interactive)
        /// </summary>
        private void UpdateModeToggleIcon(bool isDrawingMode)
        {
            // Find the Path element inside the button
            var iconPath = ModeToggleButton.Content as Path;
            if (iconPath == null)
            {
                // Try to find it by name
                iconPath = FindName("ModeToggleIcon") as Path;
            }
            if (iconPath == null) return;

            if (isDrawingMode)
            {
                // Pencil icon
                var pencilGeometry = new PathGeometry();
                
                // Pencil body
                var body = new PathFigure { StartPoint = new Point(5, 20) };
                body.Segments.Add(new LineSegment(new Point(8, 17), true));
                body.Segments.Add(new LineSegment(new Point(15, 24), true));
                body.Segments.Add(new LineSegment(new Point(12, 27), true));
                body.Segments.Add(new LineSegment(new Point(5, 20), true));
                pencilGeometry.Figures.Add(body);

                // Pencil tip
                var tip = new PathFigure { StartPoint = new Point(8, 17) };
                tip.Segments.Add(new LineSegment(new Point(20, 5), true));
                tip.Segments.Add(new LineSegment(new Point(23, 8), true));
                tip.Segments.Add(new LineSegment(new Point(11, 20), true));
                pencilGeometry.Figures.Add(tip);

                // Pencil eraser
                var eraser = new PathFigure { StartPoint = new Point(20, 5) };
                eraser.Segments.Add(new LineSegment(new Point(25, 0), true));
                eraser.Segments.Add(new LineSegment(new Point(30, 5), true));
                eraser.Segments.Add(new LineSegment(new Point(25, 10), true));
                pencilGeometry.Figures.Add(eraser);

                iconPath.Data = pencilGeometry;
            }
            else
            {
                // Hand icon (pointing/index finger)
                var handGeometry = new PathGeometry();
                
                // Palm
                var palm = new PathFigure { StartPoint = new Point(8, 20) };
                palm.Segments.Add(new LineSegment(new Point(12, 20), true));
                palm.Segments.Add(new LineSegment(new Point(15, 18), true));
                palm.Segments.Add(new LineSegment(new Point(18, 20), true));
                palm.Segments.Add(new LineSegment(new Point(20, 25), true));
                palm.Segments.Add(new LineSegment(new Point(15, 28), true));
                palm.Segments.Add(new LineSegment(new Point(10, 28), true));
                palm.Segments.Add(new LineSegment(new Point(8, 25), true));
                palm.Segments.Add(new LineSegment(new Point(8, 20), true));
                handGeometry.Figures.Add(palm);

                // Index finger
                var finger = new PathFigure { StartPoint = new Point(18, 20) };
                finger.Segments.Add(new LineSegment(new Point(22, 15), true));
                finger.Segments.Add(new LineSegment(new Point(25, 12), true));
                finger.Segments.Add(new LineSegment(new Point(25, 8), true));
                finger.Segments.Add(new LineSegment(new Point(22, 8), true));
                finger.Segments.Add(new LineSegment(new Point(20, 12), true));
                finger.Segments.Add(new LineSegment(new Point(18, 18), true));
                handGeometry.Figures.Add(finger);

                iconPath.Data = handGeometry;
            }
        }

        /// <summary>
        /// Exit the application
        /// </summary>
        private void ExitApplication(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        // We only need the Deactivated event for stability, but its primary function is reduced.
        // We ensure that if we are in Interactive Mode (isDrawingMode=false), the user can click away 
        // without issue because the Canvas is doing the heavy lifting by being IsHitTestVisible=False.
        private void AnnotatorWindow_Deactivated(object sender, System.EventArgs e)
        {
            // Optional cleanup for focus, but the core logic is now in ToggleInteractivity
            if (!isDrawingMode)
            {
                // In Interactive mode, clicks are passing through the canvas, so this is stable.
            }
        }

        /// <summary>
        /// Send drawing coordinate to the local HTTP server
        /// </summary>
        private void SendDrawingPoint(Point point, bool isStart = false, bool isEnd = false)
        {
            // Throttle sending to avoid overwhelming the server
            var now = DateTime.UtcNow;
            if (!isStart && !isEnd && (now - lastSendTime).TotalMilliseconds < SendThrottleMs)
            {
                return; // Skip this point if too soon
            }
            lastSendTime = now;

            if (currentStroke == null || currentStrokeId == null)
            {
                return;
            }

            // Get all points from current stroke
            var points = new List<double>();
            foreach (var p in currentStroke.Points)
            {
                points.Add(p.X);
                points.Add(p.Y);
            }

            // Create drawing message
            var message = new desktopdrawing.DrawingMessage
            {
                Action = isStart ? "draw" : "update",
                Shape = new desktopdrawing.DrawingShape
                {
                    Id = currentStrokeId,
                    Type = "line",
                    Tool = "pen",
                    Points = points,
                    Stroke = "#000000", // Black
                    StrokeWidth = 5,
                    LineCap = "round",
                    LineJoin = "round"
                },
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };

            // Send to server
            try
            {
                desktopdrawing.App.DrawingServer?.AddDrawingMessage(message);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[MainWindow] Error sending drawing point: {ex.Message}");
            }
        }
    }
}