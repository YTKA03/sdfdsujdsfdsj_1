using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using System.Management;

namespace GMGN_Notifications
{
    public partial class AuthWindow : Window
    {
        private readonly HttpClient httpClient = new HttpClient();
        private const string CURRENT_VERSION = "1.1.0";

        public AuthWindow()
        {
            InitializeComponent();
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
        }

        private void AuthWindow_Loaded(object sender, RoutedEventArgs e)
        {
            InitializeWebViewAsync();
        }

        private async void InitializeWebViewAsync()
        {
            try
            {
                System.Diagnostics.Debug.WriteLine("Initializing WebView2...");
                await AuthWebView.EnsureCoreWebView2Async(null);
                System.Diagnostics.Debug.WriteLine("WebView2 initialized successfully.");
                AuthWebView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
                AuthWebView.Source = new Uri("https://gmgn-mexc-notifications.com.ua/auth");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"WebView2 initialization failed: {ex.Message}");
                MessageBox.Show("Помилка ініціалізації WebView2. Перевірте встановлення WebView2 Runtime.", "Помилка", MessageBoxButton.OK, MessageBoxImage.Error);
                Application.Current.Shutdown();
            }
        }

        private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine($"WebMessageReceived: {e.WebMessageAsJson}");
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<AuthData>(e.WebMessageAsJson, options);

                if (data == null || string.IsNullOrEmpty(data.TelegramId))
                {
                    System.Diagnostics.Debug.WriteLine("Invalid or missing Telegram ID in message.");
                    return;
                }

                // Проверка версии приложения
                var versionResult = await CheckVersion();
                if (versionResult.UpdateRequired)
                {
                    MessageBox.Show("Оновіть застосунок", "Оновлення необхідно", MessageBoxButton.OK, MessageBoxImage.Warning);
                    Application.Current.Shutdown();
                    return;
                }

                // Проверка machine_guid
                string machineGuid = GetMachineGuid();
                System.Diagnostics.Debug.WriteLine($"MachineGuid: {machineGuid}");

                var checkDeviceResult = await CheckDevice(data.TelegramId, machineGuid);
                if (checkDeviceResult.Status == "success")
                {
                    var subscriptionWindow = new SubscriptionWindow(data.TelegramId, data.DaysLeft, data.EndDate);
                    subscriptionWindow.Show();
                    Close();
                }
                else if (checkDeviceResult.Message != null && checkDeviceResult.Message.Contains("Device identifiers not found"))
                {
                    var bindResult = await BindDevice(data.TelegramId, machineGuid);
                    if (bindResult.Status == "success")
                    {
                        var subscriptionWindow = new SubscriptionWindow(data.TelegramId, data.DaysLeft, data.EndDate);
                        subscriptionWindow.Show();
                        Close();
                    }
                    else
                    {
                        string errorMessage = bindResult.Message switch
                        {
                            "Device identifiers already bound to this user" => "Цей ідентифікатор пристрою вже прив'язаний до вашого Telegram ID.",
                            "Device identifiers already bound to another user" => "Цей ідентифікатор пристрою вже прив'язаний до іншого користувача. Використовуйте інший пристрій або зверніться до підтримки.",
                            _ => $"Помилка прив'язки пристрою: {bindResult.Message}"
                        };
                        MessageBox.Show(errorMessage, "Помилка", MessageBoxButton.OK, MessageBoxImage.Error);
                        Application.Current.Shutdown();
                    }
                }
                else
                {
                    MessageBox.Show(checkDeviceResult.Message ?? "Помилка: Ідентифікатори пристрою не співпадають", "Помилка", MessageBoxButton.OK, MessageBoxImage.Error);
                    Application.Current.Shutdown();
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error processing WebMessage: {ex.Message}");
                MessageBox.Show($"Помилка обробки повідомлення: {ex.Message}", "Помилка", MessageBoxButton.OK, MessageBoxImage.Error);
                Application.Current.Shutdown();
            }
        }

        private string GetMachineGuid()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT UUID FROM Win32_ComputerSystemProduct"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        return obj["UUID"]?.ToString() ?? "Unknown";
                    }
                }
                return "Unknown";
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error getting MachineGuid: {ex.Message}");
                return "Unknown";
            }
        }

        private async Task<DeviceCheckResult> CheckDevice(string telegramId, string machineGuid)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine($"Checking device for telegram_id: {telegramId}, MachineGuid: {machineGuid}");
                var response = await httpClient.PostAsync(
                    "https://gmgn-mexc-notifications.com.ua/api/check_device.php",
                    new StringContent(JsonSerializer.Serialize(new { telegram_id = telegramId, machine_guid = machineGuid }), System.Text.Encoding.UTF8, "application/json"));
                System.Diagnostics.Debug.WriteLine($"Check device response status code: {response.StatusCode}");
                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync();
                System.Diagnostics.Debug.WriteLine($"Check device response JSON: {json}");
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var result = JsonSerializer.Deserialize<DeviceCheckResult>(json, options)!;
                System.Diagnostics.Debug.WriteLine($"Check device result: Status={result.Status}, Message={result.Message}");
                return result;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error checking device: {ex.Message}");
                return new DeviceCheckResult { Status = "error", Message = $"Помилка зв'язку з сервером: {ex.Message}" };
            }
        }

        private async Task<BindResult> BindDevice(string telegramId, string machineGuid)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine($"Binding device for telegram_id: {telegramId}, MachineGuid: {machineGuid}");
                var response = await httpClient.PostAsync(
                    "https://gmgn-mexc-notifications.com.ua/api/bind_device.php",
                    new StringContent(JsonSerializer.Serialize(new { telegram_id = telegramId, machine_guid = machineGuid }), System.Text.Encoding.UTF8, "application/json"));
                System.Diagnostics.Debug.WriteLine($"Bind device response status code: {response.StatusCode}");
                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync();
                System.Diagnostics.Debug.WriteLine($"Bind device response JSON: {json}");
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var result = JsonSerializer.Deserialize<BindResult>(json, options)!;
                System.Diagnostics.Debug.WriteLine($"Bind device result: Status={result.Status}, Message={result.Message}");
                return result;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error binding device: {ex.Message}");
                return new BindResult { Status = "error", Message = $"Помилка зв'язку з сервером: {ex.Message}" };
            }
        }

        private async Task<VersionResult> CheckVersion()
        {
            try
            {
                System.Diagnostics.Debug.WriteLine("Sending version check request");
                var response = await httpClient.GetAsync($"https://gmgn-mexc-notifications.com.ua/api/check_version.php?version={CURRENT_VERSION}");
                System.Diagnostics.Debug.WriteLine($"Version check response status code: {response.StatusCode}");
                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync();
                System.Diagnostics.Debug.WriteLine($"Version check JSON: {json}");
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var versionData = JsonSerializer.Deserialize<VersionData>(json, options)!;
                System.Diagnostics.Debug.WriteLine($"Deserialized VersionData: Status={versionData.Status}, LatestVersion={versionData.LatestVersion}");
                if (versionData.Status == "success")
                {
                    bool updateRequired = string.Compare(CURRENT_VERSION, versionData.LatestVersion, StringComparison.Ordinal) < 0;
                    System.Diagnostics.Debug.WriteLine($"Version check result: UpdateRequired={updateRequired}, LatestVersion={versionData.LatestVersion}");
                    return new VersionResult { UpdateRequired = updateRequired, LatestVersion = versionData.LatestVersion };
                }
                return new VersionResult { UpdateRequired = false };
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error in CheckVersion: {ex.Message}");
                return new VersionResult { UpdateRequired = false };
            }
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if ((Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) == (ModifierKeys.Control | ModifierKeys.Shift) && e.Key == Key.I)
            {
                System.Diagnostics.Debug.WriteLine("Ctrl+Shift+I detected. Shutting down application.");
                Application.Current.Shutdown();
            }
            else if (e.Key == Key.F12)
            {
                System.Diagnostics.Debug.WriteLine("F12 detected. Shutting down application.");
                Application.Current.Shutdown();
            }
        }
    }
}