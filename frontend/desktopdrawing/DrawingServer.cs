using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;

namespace desktopdrawing
{
    /// <summary>
    /// Local HTTP server for receiving drawing coordinates from WPF app
    /// and making them available to the browser WebRTC application
    /// </summary>
    public class DrawingServer : IDisposable
    {
        private HttpListener? _listener;
        private readonly string _baseUrl;
        private readonly int _port;
        private bool _isRunning = false;
        private CancellationTokenSource? _cancellationTokenSource;
        private Task? _serverTask;

        // Queue to store drawing messages
        private readonly Queue<DrawingMessage> _messageQueue = new Queue<DrawingMessage>();
        private readonly object _queueLock = new object();

        public DrawingServer(int port = 8888)
        {
            _port = port;
            _baseUrl = $"http://localhost:{port}/";
        }

        /// <summary>
        /// Start the HTTP server
        /// </summary>
        public void Start()
        {
            if (_isRunning)
            {
                return;
            }

            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add(_baseUrl);
                _listener.Start();
                _isRunning = true;

                _cancellationTokenSource = new CancellationTokenSource();
                _serverTask = Task.Run(() => ListenAsync(_cancellationTokenSource.Token));

                Console.WriteLine($"[DrawingServer] Started on {_baseUrl}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DrawingServer] Failed to start: {ex.Message}");
                _isRunning = false;
            }
        }

        /// <summary>
        /// Stop the HTTP server
        /// </summary>
        public void Stop()
        {
            if (!_isRunning)
            {
                return;
            }

            _isRunning = false;
            _cancellationTokenSource?.Cancel();

            try
            {
                _listener?.Stop();
                _listener?.Close();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DrawingServer] Error stopping server: {ex.Message}");
            }

            // Wait for server task to complete
            try
            {
                _serverTask?.Wait(TimeSpan.FromSeconds(2));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DrawingServer] Error waiting for server task: {ex.Message}");
            }

            Console.WriteLine("[DrawingServer] Stopped");
        }

        /// <summary>
        /// Main server loop - listens for incoming requests
        /// </summary>
        private async Task ListenAsync(CancellationToken cancellationToken)
        {
            while (_isRunning && !cancellationToken.IsCancellationRequested)
            {
                try
                {
                    var context = await _listener!.GetContextAsync();
                    _ = Task.Run(() => HandleRequestAsync(context, cancellationToken));
                }
                catch (HttpListenerException ex) when (ex.ErrorCode == 995) // Operation aborted
                {
                    // Expected when stopping the server
                    break;
                }
                catch (Exception ex)
                {
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        Console.WriteLine($"[DrawingServer] Error in listener: {ex.Message}");
                    }
                }
            }
        }

        /// <summary>
        /// Handle incoming HTTP request
        /// </summary>
        private async Task HandleRequestAsync(HttpListenerContext context, CancellationToken cancellationToken)
        {
            var request = context.Request;
            var response = context.Response;

            // Add CORS headers
            response.AddHeader("Access-Control-Allow-Origin", "*");
            response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.AddHeader("Access-Control-Allow-Headers", "Content-Type");

            // Handle preflight OPTIONS request
            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            try
            {
                var path = request.Url?.AbsolutePath ?? "";

                if (path == "/api/drawing/stream" && request.HttpMethod == "GET")
                {
                    await HandleStreamRequestAsync(response, cancellationToken);
                }
                else if (path == "/api/drawing" && request.HttpMethod == "POST")
                {
                    await HandleDrawingPostAsync(request, response);
                }
                else if (path == "/api/status" && request.HttpMethod == "GET")
                {
                    await HandleStatusRequestAsync(response);
                }
                else
                {
                    response.StatusCode = 404;
                    await WriteResponseAsync(response, "Not Found");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DrawingServer] Error handling request: {ex.Message}");
                response.StatusCode = 500;
                await WriteResponseAsync(response, $"Error: {ex.Message}");
            }
        }

        /// <summary>
        /// Handle Server-Sent Events stream for real-time coordinate updates
        /// </summary>
        private async Task HandleStreamRequestAsync(HttpListenerResponse response, CancellationToken cancellationToken)
        {
            response.ContentType = "text/event-stream";
            response.AddHeader("Cache-Control", "no-cache");
            response.AddHeader("Connection", "keep-alive");

            var writer = new StreamWriter(response.OutputStream, Encoding.UTF8);
            await writer.FlushAsync();

            var lastKeepaliveTime = DateTime.UtcNow;
            const int keepaliveIntervalMs = 1000; // 1 second
            const int pollingIntervalMs = 16; // ~60fps for checking queue

            while (!cancellationToken.IsCancellationRequested)
            {
                DrawingMessage? message = null;

                lock (_queueLock)
                {
                    if (_messageQueue.Count > 0)
                    {
                        message = _messageQueue.Dequeue();
                    }
                }

                if (message != null)
                {
                    var json = JsonSerializer.Serialize(message);
                    await writer.WriteLineAsync($"data: {json}");
                    await writer.WriteLineAsync();
                    await writer.FlushAsync();

                    // Print coordinates when streaming
                    var pointsCount = message.Shape?.Points?.Count ?? 0;
                    var pointsPreview = pointsCount > 0 
                        ? string.Join(", ", message.Shape!.Points!.Take(Math.Min(6, pointsCount))) 
                        : "none";
                    if (pointsCount > 6) pointsPreview += "...";
                    
                    Console.WriteLine($"[DrawingServer] 📤 Streaming coordinates - Action: {message.Action}, " +
                        $"Tool: {message.Shape?.Tool}, Points: {pointsCount} ({pointsPreview})");
                }
                else
                {
                    // Send keepalive only once per second
                    var now = DateTime.UtcNow;
                    if ((now - lastKeepaliveTime).TotalMilliseconds >= keepaliveIntervalMs)
                    {
                        await writer.WriteLineAsync(": keepalive");
                        await writer.FlushAsync();
                        lastKeepaliveTime = now;
                        Console.WriteLine("[DrawingServer] 💓 Keepalive sent");
                    }
                }

                await Task.Delay(pollingIntervalMs, cancellationToken);
            }

            response.Close();
        }

        /// <summary>
        /// Handle POST request with drawing coordinates
        /// </summary>
        private async Task HandleDrawingPostAsync(HttpListenerRequest request, HttpListenerResponse response)
        {
            using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
            var body = await reader.ReadToEndAsync();

            Console.WriteLine($"[DrawingServer] 📥 Received POST request, body length: {body.Length}");

            try
            {
                var message = JsonSerializer.Deserialize<DrawingMessage>(body);
                if (message != null)
                {
                    var pointsCount = message.Shape?.Points?.Count ?? 0;
                    Console.WriteLine($"[DrawingServer] ✅ Queued drawing message - Action: {message.Action}, " +
                        $"Tool: {message.Shape?.Tool}, Points: {pointsCount}");

                    lock (_queueLock)
                    {
                        _messageQueue.Enqueue(message);
                        // Limit queue size to prevent memory issues
                        while (_messageQueue.Count > 1000)
                        {
                            _messageQueue.Dequeue();
                        }
                    }

                    response.StatusCode = 200;
                    await WriteResponseAsync(response, "OK");
                }
                else
                {
                    Console.WriteLine("[DrawingServer] ❌ Invalid message format (null)");
                    response.StatusCode = 400;
                    await WriteResponseAsync(response, "Invalid message format");
                }
            }
            catch (JsonException ex)
            {
                Console.WriteLine($"[DrawingServer] ❌ JSON parse error: {ex.Message}");
                response.StatusCode = 400;
                await WriteResponseAsync(response, $"Invalid JSON: {ex.Message}");
            }
        }

        /// <summary>
        /// Handle status check request
        /// </summary>
        private async Task HandleStatusRequestAsync(HttpListenerResponse response)
        {
            var status = new
            {
                running = _isRunning,
                port = _port,
                queueSize = _messageQueue.Count
            };

            var json = JsonSerializer.Serialize(status);
            response.StatusCode = 200;
            await WriteResponseAsync(response, json, "application/json");
        }

        /// <summary>
        /// Write response to client
        /// </summary>
        private async Task WriteResponseAsync(HttpListenerResponse response, string content, string contentType = "text/plain")
        {
            response.ContentType = contentType;
            var buffer = Encoding.UTF8.GetBytes(content);
            response.ContentLength64 = buffer.Length;
            await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
            response.Close();
        }

        /// <summary>
        /// Add a drawing message to the queue (called from MainWindow)
        /// </summary>
        public void AddDrawingMessage(DrawingMessage message)
        {
            lock (_queueLock)
            {
                _messageQueue.Enqueue(message);
                // Limit queue size
                while (_messageQueue.Count > 1000)
                {
                    _messageQueue.Dequeue();
                }
            }
        }

        public void Dispose()
        {
            Stop();
            _cancellationTokenSource?.Dispose();
        }
    }

    /// <summary>
    /// Drawing message format matching WebRTC whiteboard format
    /// </summary>
    public class DrawingMessage
    {
        public string Action { get; set; } = "draw";
        public DrawingShape? Shape { get; set; }
        public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    /// <summary>
    /// Drawing shape data
    /// </summary>
    public class DrawingShape
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Type { get; set; } = "line";
        public string Tool { get; set; } = "pen";
        public List<double> Points { get; set; } = new List<double>();
        public string Stroke { get; set; } = "#000000";
        public double StrokeWidth { get; set; } = 5;
        public string LineCap { get; set; } = "round";
        public string LineJoin { get; set; } = "round";
    }
}

