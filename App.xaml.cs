using System.Windows;

namespace GMGN_Notifications
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Проверяем, принято ли соглашение
            if (!AgreementWindow.IsAgreementAccepted())
            {
                // Если соглашение не принято, открываем AgreementWindow
                var agreementWindow = new AgreementWindow();
                agreementWindow.Show();
            }
            else
            {
                // Если соглашение принято, открываем AuthWindow
                var authWindow = new AuthWindow();
                authWindow.Show();
            }
        }
    }
}