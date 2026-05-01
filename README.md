# Ecommerce Price Comparator

An intelligent, multi-threaded price comparison engine built with Flask that simultaneously scrapes Amazon and Flipkart to find you the best deals. The application leverages a robust fallback scraping architecture and a custom fuzzy matching algorithm to correlate identical products across different platforms.

## Features

- **Parallel Scraping**: Scrapes Amazon and Flipkart simultaneously using `ThreadPoolExecutor` to drastically reduce search latency.
- **2-Stage Data Extraction**: Employs a sophisticated scraping pipeline for Flipkart, first discovering URLs from the search results, and then concurrently parsing the structured `application/ld+json` data from individual product pages for extreme accuracy.
- **Smart Fuzzy Matching**: Uses custom natural language processing (NLP) to extract key terms, eliminate filler words, and calculate term overlap + string similarity to perfectly pair Amazon products with their Flipkart counterparts.
- **Intelligent Recommendations**: Calculates the best value proposition by weighing both absolute price differences and aggregate user ratings.

## Prerequisites
- Python 3.8+
- [ScraperAPI](https://www.scraperapi.com/) keys for rotating proxies

## Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/chundawat-h/EcommercePriceComparator.git
   cd EcommercePriceComparator
   ```

2. **Install Dependencies**
   ```bash
   pip install flask requests beautifulsoup4 pandas python-dotenv flask-sqlalchemy
   ```

3. **Configure Environment Variables**
   The application uses `python-dotenv` to securely load API keys. 
   - Copy the example configuration file:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and replace the placeholder text with your actual ScraperAPI keys.

4. **Run the Application**
   ```bash
   python app.py
   ```
   The application will start locally on `http://127.0.0.1:5000/`.

## Architecture

- `app.py`: The main Flask server containing the routing, concurrent scraping orchestrator, and fuzzy matching recommendation engine.
- `matching.py`: A standalone test module specifically for testing the sequence matcher and recommendation algorithm against raw JSON arrays.
- `instance/prices.db`: The local SQLite database designed to track historical price changes.

## 🚀 Future Roadmap

- **Database Search Caching**: Integrate the SQLite database to store and serve previous search results. This will drastically reduce redundant scraping requests, saving API credits and instantly loading results for popular queries.
- **Scheduled Background Scraping**: Implement a CRON/scheduler system (e.g., Celery or APScheduler) to run in the background and autonomously update the prices of products stored in the database.

## License

This project is open source.
