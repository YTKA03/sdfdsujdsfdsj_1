using System.Text.Json.Serialization;

namespace GMGN_Notifications
{
    public class DeviceCheckResult
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class BindResult
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class SubscriptionResult
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("daysLeft")]
        public int DaysLeft { get; set; }

        [JsonPropertyName("subscriptionEndDate")]
        public string? EndDate { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class VersionData
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("latest_version")]
        public string? LatestVersion { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class VersionResult
    {
        public bool UpdateRequired { get; set; }
        public string? LatestVersion { get; set; }
    }

    public class AuthData
    {
        [JsonPropertyName("telegramId")]
        public string? TelegramId { get; set; }

        [JsonPropertyName("daysLeft")]
        public int DaysLeft { get; set; }

        [JsonPropertyName("subscriptionEndDate")]
        public string? EndDate { get; set; }
    }
}