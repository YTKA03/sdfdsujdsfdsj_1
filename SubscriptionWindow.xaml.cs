using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Management;

namespace GMGN_Notifications
{
    public partial class SubscriptionWindow : Window
    {
        private readonly string telegramId;
        private readonly HttpClient httpClient = new HttpClient();
        private const string CURRENT_VERSION = "1.1.0";

        public SubscriptionWindow(string telegramId, int daysLeft, string? endDate)
        {
            InitializeComponent();
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            this.telegramId = telegramId;

            TelegramIdRun.Text = telegramId;
            DaysLeftRun.Text = daysLeft.ToString();
            EndDateRun.Text = endDate ?? "Не вказано";
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

        private async void ProceedButton_Click(object sender, RoutedEventArgs e)
        {
            ProceedButton.IsEnabled = false;
            ErrorMessage.Visibility = Visibility.Hidden;

            if (string.IsNullOrEmpty(telegramId))
            {
                ErrorMessage.Text = "Помилка: ID користувача не знайдено";
                ErrorMessage.Visibility = Visibility.Visible;
                ProceedButton.IsEnabled = true;
                return;
            }

            // Проверка версии приложения
            var versionResult = await CheckVersion();
            if (versionResult.UpdateRequired)
            {
                ErrorMessage.Text = "Оновіть застосунок";
                ErrorMessage.Visibility = Visibility.Visible;
                await Task.Delay(10000);
                Application.Current.Shutdown();
                return;
            }

            // Проверка machine_guid
            string machineGuid = GetMachineGuid();
            var deviceCheckResult = await CheckDevice(telegramId, machineGuid);
            if (deviceCheckResult.Status != "success")
            {
                if (deviceCheckResult.Message.Contains("Device identifiers not found"))
                {
                    // Пытаемся привязать устройство
                    var bindResult = await BindDevice(telegramId, machineGuid);
                    if (bindResult.Status != "success")
                    {
                        ErrorMessage.Text = bindResult.Message switch
                        {
                            "Device identifiers already bound to this user" => "Цей ідентифікатор пристрою вже прив'язаний до вашого Telegram ID.",
                            "Device identifiers already bound to another user" => "Цей ідентифікатор пристрою вже прив'язаний до іншого користувача. Використовуйте інший пристрій або зверніться до підтримки.",
                            _ => $"Помилка прив'язки пристрою: {bindResult.Message}"
                        };
                        ErrorMessage.Visibility = Visibility.Visible;
                        await Task.Delay(10000);
                        Application.Current.Shutdown();
                        return;
                    }
                }
                else
                {
                    ErrorMessage.Text = deviceCheckResult.Message ?? "Помилка: Ідентифікатори пристрою не співпадають";
                    ErrorMessage.Visibility = Visibility.Visible;
                    await Task.Delay(10000);
                    Application.Current.Shutdown();
                    return;
                }
            }

            // Проверка подписки
            var subscriptionResult = await CheckSubscription(telegramId);
            if (subscriptionResult.Status == "success")
            {
                if (subscriptionResult.DaysLeft > 0 && !string.IsNullOrEmpty(subscriptionResult.EndDate))
                {
                    var mainWindow = new MainWindow();
                    mainWindow.Show();
                    Close();
                }
                else
                {
                    ErrorMessage.Text = "Потрібно продовжити підписку";
                    ErrorMessage.Visibility = Visibility.Visible;
                    await Task.Delay(10000);
                    Application.Current.Shutdown();
                }
            }
            else
            {
                ErrorMessage.Text = subscriptionResult.Message ?? "Помилка перевірки підписки";
                ErrorMessage.Visibility = Visibility.Visible;
                await Task.Delay(10000);
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

        private async Task<SubscriptionResult> CheckSubscription(string telegramId)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine($"Sending subscription check request for telegram_id: {telegramId}");
                var response = await httpClient.PostAsync(
                    "https://gmgn-mexc-notifications.com.ua/api/api.php",
                    new StringContent(JsonSerializer.Serialize(new { telegram_id = telegramId }), System.Text.Encoding.UTF8, "application/json"));
                System.Diagnostics.Debug.WriteLine($"Response status code: {response.StatusCode}");
                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync();
                System.Diagnostics.Debug.WriteLine($"Received JSON: {json}");
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var result = JsonSerializer.Deserialize<SubscriptionResult>(json, options)!;
                System.Diagnostics.Debug.WriteLine($"Deserialized SubscriptionResult: Status={result.Status}, DaysLeft={result.DaysLeft}, EndDate={result.EndDate}");
                return result;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error in CheckSubscription: {ex.Message}");
                return new SubscriptionResult { Status = "error", Message = $"Помилка зв'язку з сервером: {ex.Message}" };
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
    }
}