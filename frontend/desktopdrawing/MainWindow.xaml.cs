using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace ScreenAnnotator
{
    public partial class MainWindow : Window
    {
        private Polyline? currentStroke;
        private bool isDrawing = false;

        // This now tracks the requested state, similar to before.
        private bool isDrawingMode = true;

        public MainWindow()
        {
            InitializeComponent();
        }

        // --- Core Drawing Logic ---

        private void DrawingCanvas_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (isDrawingMode && e.LeftButton == MouseButtonState.Pressed)
            {
                isDrawing = true;

                currentStroke = new Polyline()
                {
                    Stroke = Brushes.Black,
                    StrokeThickness = 5,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    StrokeLineJoin = PenLineJoin.Round
                };

                currentStroke.Points.Add(e.GetPosition(DrawingCanvas));
                DrawingCanvas.Children.Add(currentStroke);
            }
        }

        private void DrawingCanvas_MouseMove(object sender, MouseEventArgs e)
        {
            if (isDrawing && currentStroke != null)
            {
                currentStroke.Points.Add(e.GetPosition(DrawingCanvas));
            }
        }

        private void DrawingCanvas_MouseUp(object sender, MouseButtonEventArgs e)
        {
            isDrawing = false;
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

                // 3. Update Button
                ModeToggleButton.Content = "Switch to Interactive";
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

                // 3. Update Button
                ModeToggleButton.Content = "Switch to Drawing";
            }
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
    }
}