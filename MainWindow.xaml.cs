using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection; // Добавлено для работы с ресурсами
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Text.RegularExpressions;

namespace GMGN_Notifications
{
    public class RelayCommand : ICommand
    {
        private readonly Action<object?> _execute;
        private readonly Func<object?, bool>? _canExecute;

        public RelayCommand(Action<object?> execute, Func<object?, bool>? canExecute = null)
        {
            _execute = execute ?? throw new ArgumentNullException(nameof(execute));
            _canExecute = canExecute;
        }

        public bool CanExecute(object? parameter) => _canExecute?.Invoke(parameter) ?? true;
        public void Execute(object? parameter) => _execute(parameter);
        public event EventHandler? CanExecuteChanged
        {
            add => CommandManager.RequerySuggested += value;
            remove => CommandManager.RequerySuggested -= value;
        }

        public void RaiseCanExecuteChanged()
        {
            CommandManager.InvalidateRequerySuggested();
        }
    }

    public class TabItemViewModel : INotifyPropertyChanged
    {
        private string _header = "New Tab";
        public string Header
        {
            get => _header;
            set
            {
                _header = value;
                OnPropertyChanged(nameof(Header));
            }
        }

        public WebView2 WebView { get; set; } = new WebView2();

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class MainWindowViewModel : INotifyPropertyChanged
    {
        private ObservableCollection<TabItemViewModel> _tabItems;
        private TabItemViewModel? _selectedTab;
        private string _urlText;

        public ObservableCollection<TabItemViewModel> TabItems
        {
            get => _tabItems;
            set
            {
                _tabItems = value;
                OnPropertyChanged(nameof(TabItems));
            }
        }

        public TabItemViewModel? SelectedTab
        {
            get => _selectedTab;
            set
            {
                _selectedTab = value;
                OnPropertyChanged(nameof(SelectedTab));
                UpdateNavigationCommands();
                if (_selectedTab != null)
                {
                    UpdateUrl(_selectedTab.WebView.Source?.ToString() ?? string.Empty);
                }
                Debug.WriteLine($"SelectedTab changed: {(_selectedTab != null ? _selectedTab.Header : "null")}");
            }
        }

        public string UrlText
        {
            get => _urlText;
            set
            {
                _urlText = value;
                OnPropertyChanged(nameof(UrlText));
            }
        }

        public bool CanGoBack => SelectedTab?.WebView.CanGoBack == true;
        public bool CanGoForward => SelectedTab?.WebView.CanGoForward == true;

        public ICommand AddTabCommand { get; }
        public ICommand CloseTabCommand { get; }
        public ICommand GoBackCommand { get; }
        public ICommand GoForwardCommand { get; }
        public ICommand RefreshCommand { get; }
        public ICommand LoadUrlCommand { get; }

        public MainWindowViewModel()
        {
            _tabItems = new ObservableCollection<TabItemViewModel>();
            _selectedTab = null;
            _urlText = string.Empty;
            TabItems = _tabItems;

            AddTabCommand = new RelayCommand(AddTab, _ => true);
            CloseTabCommand = new RelayCommand(CloseTab, CanCloseTab);
            GoBackCommand = new RelayCommand(GoBack, _ => CanGoBack);
            GoForwardCommand = new RelayCommand(GoForward, _ => CanGoForward);
            RefreshCommand = new RelayCommand(Refresh, _ => SelectedTab != null);
            LoadUrlCommand = new RelayCommand(LoadUrl, _ => SelectedTab != null);

            TabItems.CollectionChanged += (s, e) =>
            {
                Debug.WriteLine($"TabItems changed. Total tabs: {TabItems.Count}");
                (CloseTabCommand as RelayCommand)?.RaiseCanExecuteChanged();
            };

            AddTab(null);
        }

        private bool CanCloseTab(object? parameter)
        {
            bool canClose = TabItems.Count > 1;
            Debug.WriteLine($"CanCloseTab checked: {canClose}, Parameter={parameter}");
            return canClose;
        }

        private void AddTab(object? parameter)
        {
            Debug.WriteLine("AddTab command executed");
            var newTab = new TabItemViewModel();
            newTab.WebView.EnsureCoreWebView2Async(null).ContinueWith(async task =>
            {
                Debug.WriteLine("WebView2 initialization started");
                await Application.Current.Dispatcher.InvokeAsync(() =>
                {
                    if (newTab.WebView.CoreWebView2 != null)
                    {
                        newTab.WebView.Source = new Uri("https://www.google.com");
                        Debug.WriteLine("WebView2 Source set to https://www.google.com");
                    }
                    else
                    {
                        Debug.WriteLine("WebView2 CoreWebView2 is null after initialization");
                    }
                });
            });

            TabItems.Add(newTab);
            Debug.WriteLine($"New tab added. Total tabs: {TabItems.Count}");
            SelectedTab = newTab;
            Debug.WriteLine("SelectedTab updated");
        }

        private void CloseTab(object? parameter)
        {
            Debug.WriteLine($"CloseTab command executed. Parameter={parameter?.GetType()?.Name ?? "null"}");
            if (parameter is TabItemViewModel tab)
            {
                Debug.WriteLine($"Parameter is TabItemViewModel. Header={tab.Header}");
                int index = TabItems.IndexOf(tab);
                Debug.WriteLine($"Closing tab at index {index}. Total tabs: {TabItems.Count}");
                tab.WebView.Dispose();
                TabItems.Remove(tab);
                Debug.WriteLine($"Tab removed. New total tabs: {TabItems.Count}");
                if (SelectedTab == tab)
                {
                    SelectedTab = TabItems[Math.Max(0, index - 1)];
                    Debug.WriteLine($"New selected tab index: {Math.Max(0, index - 1)}");
                }
            }
            else
            {
                Debug.WriteLine("Cannot close tab: Parameter is not TabItemViewModel");
            }
        }

        private void GoBack(object? parameter)
        {
            Debug.WriteLine($"GoBack command executed. CanGoBack={CanGoBack}, SelectedTab={SelectedTab != null}");
            if (SelectedTab?.WebView.CanGoBack == true)
            {
                SelectedTab.WebView.GoBack();
                Debug.WriteLine("WebView.GoBack called");
                UpdateNavigationCommands();
            }
            else
            {
                Debug.WriteLine("Cannot go back: WebView or CanGoBack is false");
            }
        }

        private void GoForward(object? parameter)
        {
            Debug.WriteLine($"GoForward command executed. CanGoForward={CanGoForward}, SelectedTab={SelectedTab != null}");
            if (SelectedTab?.WebView.CanGoForward == true)
            {
                SelectedTab.WebView.GoForward();
                Debug.WriteLine("WebView.GoForward called");
                UpdateNavigationCommands();
            }
            else
            {
                Debug.WriteLine("Cannot go forward: WebView or CanGoForward is false");
            }
        }

        private void Refresh(object? parameter)
        {
            Debug.WriteLine($"Refresh command executed. SelectedTab={SelectedTab != null}");
            if (SelectedTab?.WebView != null)
            {
                SelectedTab.WebView.Reload();
                Debug.WriteLine("WebView.Reload called");
                UpdateNavigationCommands();
            }
            else
            {
                Debug.WriteLine("Cannot refresh: SelectedTab or WebView is null");
            }
        }

        private void LoadUrl(object? parameter)
        {
            Debug.WriteLine($"LoadUrl command executed. UrlText={UrlText}");
            if (SelectedTab?.WebView != null && !string.IsNullOrWhiteSpace(UrlText))
            {
                string url = UrlText;
                if (!url.StartsWith("http://") && !url.StartsWith("https://"))
                {
                    url = "https://" + url;
                }
                try
                {
                    SelectedTab.WebView.Source = new Uri(url);
                    Debug.WriteLine($"WebView.Source set to {url}");
                }
                catch (UriFormatException)
                {
                    Debug.WriteLine($"Invalid URL format: {url}");
                }
            }
            else
            {
                Debug.WriteLine("Cannot load URL: SelectedTab, WebView, or UrlText is invalid");
            }
        }

        public void UpdateUrl(string url)
        {
            UrlText = url;
            Debug.WriteLine($"UpdateUrl called: {url}");
        }

        public void UpdateNavigationCommands()
        {
            Debug.WriteLine($"UpdateNavigationCommands called. CanGoBack={CanGoBack}, CanGoForward={CanGoForward}");
            OnPropertyChanged(nameof(CanGoBack));
            OnPropertyChanged(nameof(CanGoForward));
            (GoBackCommand as RelayCommand)?.RaiseCanExecuteChanged();
            (GoForwardCommand as RelayCommand)?.RaiseCanExecuteChanged();
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public partial class MainWindow : Window
    {
        private readonly MainWindowViewModel _viewModel;

        public MainWindow()
        {
            InitializeComponent();
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            _viewModel = new MainWindowViewModel();
            DataContext = _viewModel;

            foreach (var tab in _viewModel.TabItems)
            {
                SubscribeToWebViewEvents(tab.WebView);
            }

            _viewModel.PropertyChanged += (s, e) =>
            {
                if (e.PropertyName == nameof(MainWindowViewModel.SelectedTab) && _viewModel.SelectedTab != null)
                {
                    SubscribeToWebViewEvents(_viewModel.SelectedTab.WebView);
                }
            };
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

        private void SubscribeToWebViewEvents(WebView2 webView)
        {
            webView.CoreWebView2InitializationCompleted += WebView_CoreWebView2InitializationCompleted;
            webView.NavigationCompleted += WebView_NavigationCompleted;
            webView.SourceChanged += WebView_SourceChanged;
        }

        private void WebView_CoreWebView2InitializationCompleted(object? sender, CoreWebView2InitializationCompletedEventArgs e)
        {
            Debug.WriteLine($"WebView2 initialization: IsSuccess={e.IsSuccess}");
            if (e.IsSuccess)
            {
                var webView = sender as WebView2;
                if (webView == null || webView.CoreWebView2 == null)
                {
                    Debug.WriteLine("WebView2 или CoreWebView2 равны null после инициализации");
                    return;
                }

                webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                Debug.WriteLine("Настройки WebView2 установлены: AreDevToolsEnabled=false, AreDefaultContextMenusEnabled=false");

                string localPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "sounds");
                if (!Directory.Exists(localPath))
                {
                    Directory.CreateDirectory(localPath);
                    Debug.WriteLine($"Создана папка для звуков: {localPath}");
                }
                webView.CoreWebView2.SetVirtualHostNameToFolderMapping("local.sounds", localPath, CoreWebView2HostResourceAccessKind.Allow);
                Debug.WriteLine("Установлено виртуальное сопоставление хоста для звуков");

                var tab = _viewModel.TabItems.FirstOrDefault(t => t.WebView == webView);
                if (tab != null && tab == _viewModel.SelectedTab)
                {
                    _viewModel.UpdateUrl(webView.Source?.ToString() ?? string.Empty);
                    _viewModel.UpdateNavigationCommands();
                    Debug.WriteLine($"Состояние навигации обновлено: CanGoBack={_viewModel.CanGoBack}, CanGoForward={_viewModel.CanGoForward}");
                }
            }
            else
            {
                Debug.WriteLine($"Ошибка инициализации WebView2: {e.InitializationException?.Message}");
                MessageBox.Show($"Ошибка инициализации WebView2: {e.InitializationException?.Message}");
                Application.Current.Shutdown();
            }
        }

        private async void WebView_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            Debug.WriteLine($"Navigation completed: IsSuccess={e.IsSuccess}");
            if (sender is WebView2 webView && e.IsSuccess)
            {
                var tab = _viewModel.TabItems.FirstOrDefault(t => t.WebView == webView);
                if (tab != null)
                {
                    string title = webView.CoreWebView2.DocumentTitle;
                    tab.Header = string.IsNullOrWhiteSpace(title) ? "New Tab" : title;
                    Debug.WriteLine($"Tab header updated: {tab.Header}");

                    if (tab == _viewModel.SelectedTab)
                    {
                        _viewModel.UpdateUrl(webView.Source?.ToString() ?? string.Empty);
                        _viewModel.UpdateNavigationCommands();
                        Debug.WriteLine($"UrlText updated: {_viewModel.UrlText}");

                        string currentUrl = webView.Source.ToString();
                        if (Regex.IsMatch(currentUrl, @"^https://gmgn\.ai/[^/]+/token/[^/]+$"))
                        {
                            Debug.WriteLine($"URL matches pattern: {currentUrl}. Executing transaction script.");
                            await ExecuteTransactionScriptAsync(webView);
                        }
                        else
                        {
                            Debug.WriteLine($"URL does not match pattern: {currentUrl}");
                        }
                    }
                }
            }
            else
            {
                Debug.WriteLine("Navigation failed or WebView is null");
            }
        }

        private async System.Threading.Tasks.Task ExecuteTransactionScriptAsync(WebView2 webView)
        {
            try
            {
                // Чтение JavaScript-кода из встроенного ресурса
                string scriptContent;
                string resourceName = "GMGN_Notifications.Scripts.TransactionScript.js";
                using (Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
                {
                    if (stream == null)
                    {
                        // Вывод всех доступных ресурсов для отладки
                        var resourceNames = Assembly.GetExecutingAssembly().GetManifestResourceNames();
                        Debug.WriteLine("Доступные ресурсы:");
                        foreach (var name in resourceNames)
                        {
                            Debug.WriteLine($" - {name}");
                        }

                        Debug.WriteLine($"Ресурс {resourceName} не найден.");
                        MessageBox.Show($"Файл TransactionScript.js не найден в ресурсах сборки. Ожидаемое имя: {resourceName}");
                        return;
                    }

                    using (StreamReader reader = new StreamReader(stream))
                    {
                        scriptContent = await reader.ReadToEndAsync();
                    }
                }

                // Выполнение JavaScript-кода
                await webView.CoreWebView2.ExecuteScriptAsync(scriptContent);
                Debug.WriteLine("JavaScript скрипт транзакций успешно выполнен");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Ошибка выполнения JavaScript: {ex.Message}");
                MessageBox.Show($"Ошибка выполнения JavaScript: {ex.Message}");
            }
        }

        private void WebView_SourceChanged(object? sender, CoreWebView2SourceChangedEventArgs e)
        {
            Debug.WriteLine($"SourceChanged: IsNewDocument={e.IsNewDocument}");
            if (sender is WebView2 webView)
            {
                var tab = _viewModel.TabItems.FirstOrDefault(t => t.WebView == webView);
                if (tab != null && tab == _viewModel.SelectedTab)
                {
                    _viewModel.UpdateUrl(webView.Source?.ToString() ?? string.Empty);
                    Debug.WriteLine($"UrlText updated from SourceChanged: {_viewModel.UrlText}");
                }
            }
        }

        private void UrlBar_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                Debug.WriteLine("UrlBar Enter key pressed");
                _viewModel.LoadUrlCommand.Execute(null);
            }
        }
    }
}