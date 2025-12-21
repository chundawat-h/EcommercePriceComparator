from flask import Flask, request, jsonify
import pandas as pd
import requests
from bs4 import BeautifulSoup
import urllib.parse
import time
import json
from threading import Thread
from queue import Queue
import re
import os
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from collections import Counter

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///prices.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Define the models for price history
class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    platform = db.Column(db.String(20), nullable=False)  # 'amazon' or 'flipkart'
    product_url = db.Column(db.String(500), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    price_history = db.relationship('PriceHistory', backref='product', lazy=True, cascade="all, delete-orphan")

class PriceHistory(db.Model):
    __tablename__ = 'price_history'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    price = db.Column(db.Float, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)

# Create database tables
with app.app_context():
    db.create_all()
# _________________________________________________SCRAPING______________________________________________________________________________________________________________________________________
# Import the scraping functions from the provided code
# Note: The API keys will be taken from environment variables with fallbacks
SCRAPING_BEE_API_KEY = os.getenv("SCRAPING_BEE_API_KEY", "ce5b1f21b70ec889c0668e0f0caf8813")
SCRAPER_API_URL = "https://api.scraperapi.com"
SCRAPINGBEE_API_URL = 'https://app.scrapingbee.com/api/v1/'
SCRAPER_API_KEY_flipkart = os.getenv("SCRAPER_API_KEY_FLIPKART", "eecbe0411def14a6601ddad42aa894e1")

# Store active scraping queues
active_queues = {}

def scrape_amazon(query, queue):
    
    try:
        url = f"{SCRAPER_API_URL}?api_key={SCRAPING_BEE_API_KEY}&url=https://www.amazon.in/s?k={query}"
        response = requests.get(url)
        soup = BeautifulSoup(response.text, "html.parser")
        
        for item in soup.find_all("div", {"data-component-type": "s-search-result"}):
            try:
                name = item.h2.text.strip().lower()
                name = re.sub(r'(currently unavailable|add to compare)', '', name)
                price = item.find("span", class_="a-price-whole").text.strip()
                image = item.find("img", class_="s-image")["src"]
                url = "https://www.amazon.in" + item.find("a", class_="a-link-normal")["href"]

                # Extract rating
                rating_tag = item.find("span", class_="a-icon-alt")
                rating = rating_tag.text.strip().split()[0] if rating_tag else "N/A"
                
                product = {
                    'name': name,
                    'price': price,
                    'image_url': image,
                    'url': url,
                    'rating': rating,
                    'source': 'amazon'
                }
                queue.put(('amazon', product))
            except:
                continue
    except Exception as e:
        print(f"Amazon Error: {e}")
    finally:
        queue.put(('amazon', None))  # Signal completion

def scrape_flipkart(keyword, queue, attempt=1, max_retries=3):
    encoded_keyword = urllib.parse.quote(keyword)
    target_url = f"https://www.flipkart.com/search?q={encoded_keyword}&otracker=search&otracker1=search&marketplace=FLIPKART&as-show=on&as=off"
    
    params = {
        'api_key': SCRAPER_API_KEY_flipkart,
        'url': target_url,
        'premium_proxy': 'true',
        'country_code': 'in',
        'render_js': 'true',
        'wait': '2000'
    }
    try:
        response = requests.get(SCRAPER_API_URL, params=params, timeout=30)      
        if response.status_code != 200:
            if attempt < max_retries:
                wait_time = 2 ** attempt
                print(f"ScrapingBee API error: {response.status_code}. Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
                return scrape_flipkart(keyword, queue, attempt + 1, max_retries)
            else:
                return {
                    "available": False,
                    "message": f"ScrapingBee API error: {response.status_code}. Credits may be exhausted."
                }

        soup = BeautifulSoup(response.text, 'html.parser')
        product_links = soup.find_all("a", href=re.compile("/p/"))

        if not product_links:
            return {
                "available": False,
                "message": "No products found or structure changed"
            }

        seen = set()  # to avoid duplicates

        for link in product_links:
            href = link.get("href")
            if not href or href in seen:
                continue
            seen.add(href)
        
            product_url = "https://www.flipkart.com" + href.split('?')[0]

            name = link.text.strip().lower()
            name = re.sub(r'(currently unavailable|add to compare)', '', name)

            if not name:
                continue  # skip if no product name

            # Try to find parent block to search inside
            product_block = link.find_parent("div")
            if not product_block:
                continue
            
            # Try price
            price = "Price not available"
            price_elem = product_block.find("div", class_=re.compile(r"_\d{6}|Nx9bqj|CxhGGd"))
            if price_elem:
                price = price_elem.text.strip()
            
            # Try rating
            rating = "Rating not available"
            rating_elem = product_block.find("div", class_=re.compile(r"_3LWZlK|XQDdHH"))
            if rating_elem:
                rating_text = rating_elem.text.strip()
                rating_match = re.search(r'\d+(\.\d+)?', rating_text)
                if rating_match:
                    rating = f"{rating_match.group()}"
            
            # Try image
            image_url = None
            img_tag = link.find("img")
            
            if img_tag:
                image_url = img_tag.get("src") or img_tag.get("data-src")
            
            product = ({
                "name": name,
                "url": product_url,
                "price": price,
                "image_url": image_url,
                'source': 'flipkart',
                "rating": rating
            })
            queue.put(('flipkart', product))

    except requests.exceptions.RequestException as e:
        if attempt < max_retries:
            wait_time = 2 ** attempt
            print(f"Error: {str(e)}. Retrying in {wait_time} seconds...")
            time.sleep(wait_time)
            return scrape_flipkart(keyword, queue, attempt + 1, max_retries)
        else:
            return {
                "available": False,
                "message": f"Error making request after {max_retries} attempts: {str(e)}"
            }
    except Exception as e:
        import traceback
        return {
            "available": False,
            "message": f"An error occurred: {str(e)}\n{traceback.format_exc()}"
        }
    finally:
        queue.put(('flipkart', None))
# _________________________________________________SCRAPING______________________________________________________________________________________________________________________________________
# Configure static folder
app.static_folder = 'static'
app.static_url_path = '/static'

@app.route('/')
def index():
    # Return the index.html file directly
    with open('templates/index.html', 'r') as file:
        return file.read()

@app.route('/comparison')
def comparison():
    # Return the comparison.html file directly
    with open('templates/comparison.html', 'r') as file:
        return file.read()

@app.route('/compare-product')
def compare_product():
    query = request.args.get('query', '')
    
    if not query:
        return jsonify({"error": "No query parameter provided"}), 400
    
    # Create a unique ID for this scraping operation
    import uuid
    scrape_id = str(uuid.uuid4())
    
    # Initialize queue and results
    queue = Queue()
    active_queues[scrape_id] = {
        'amazon': [],
        'flipkart': [],
        'amazon_done': False,
        'flipkart_done': False,
        'start_time': time.time()
    }
    
    # Start scraping threads
    Thread(target=scrape_amazon, args=(query, queue)).start()
    Thread(target=scrape_flipkart, args=(query, queue)).start()
    
    # Collect results from queue
    results = {
        'amazon': [],
        'flipkart': [],
        'recommendation': {}
    }
    
    timeout = 30  # seconds
    start_time = time.time()
    sources_completed = set()
    
    while len(sources_completed) < 2 and time.time() - start_time < timeout:
        try:
            source, product = queue.get(timeout=1)
            if product is None:  # Indicates completion of a source
                sources_completed.add(source)
            else:
                results[source].append(product)
        except:
            # Queue is empty, continue waiting
            pass
    
    # Process results to find best deals
    if results['amazon'] or results['flipkart']:
        # Find products that appear on both platforms by using fuzzy matching on names
        amazon_products = results['amazon']
        flipkart_products = results['flipkart']
        
        # Generate recommendations
        recommendations = []
        
        # Find close matches between the two platforms
        for a_product in amazon_products:
            a_name = a_product['name'].lower()
            a_price = a_product['price'].replace(',', '').replace('₹', '').strip()
            
            try:
                a_price = float(a_price)
            except:
                a_price = 0
            
            a_rating = a_product['rating']
            if a_rating == 'N/A':
                a_rating = 0
            else:
                try:
                    a_rating = float(a_rating.split(' ')[0])
                except:
                    a_rating = 0
            
            best_match = None
            highest_similarity = 0
            
            # Extract key product terms for better matching
            
            
            # Extract key words removing common filler words
            def extract_key_terms(product_name):
                # Convert to lowercase and split into words
                words = re.findall(r'\b[a-z0-9]+\b', product_name.lower())
                
                # Filter out common words and very short terms
                stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'of', 'with', 'for', 'in', 'on', 'at', 'to', 'from'}
                return [w for w in words if w not in stopwords and len(w) > 2]
            
            # Get key terms from Amazon product
            a_terms = extract_key_terms(a_name)
            a_term_set = set(a_terms)
            
            for f_product in flipkart_products:
                f_name = f_product['name'].lower()
                
                # Get key terms from Flipkart product
                f_terms = extract_key_terms(f_name)
                f_term_set = set(f_terms)
                
                # Calculate term overlap
                common_terms = a_term_set.intersection(f_term_set)
                if len(common_terms) >= 2:  # At least 3 common significant terms
                    # Calculate string similarity for verification
                    from difflib import SequenceMatcher
                    similarity = SequenceMatcher(None, a_name, f_name).ratio()
                    
                    # Boost similarity based on term overlap
                    term_similarity = len(common_terms) / max(len(a_term_set), len(f_term_set))
                    combined_similarity = (similarity + term_similarity) / 2
                    
                    if combined_similarity > 0.4 and combined_similarity > highest_similarity:  # Lower threshold but combined metrics
                        highest_similarity = combined_similarity
                        best_match = f_product
            
            if best_match:
                f_price = best_match['price'].replace(',', '').replace('₹', '').strip()
                try:
                    f_price = float(f_price)
                except:
                    f_price = 0
                
                f_rating = best_match['rating']
                if f_rating == 'Rating not available':
                    f_rating = 0
                else:
                    try:
                        f_rating = float(f_rating.split(' ')[0])
                    except:
                        f_rating = 0
                
                # Determine better option
                better_platform = None
                reason = ""
                
                if a_price > 0 and f_price > 0:
                    price_diff_percent = abs(a_price - f_price) / max(a_price, f_price) * 100
                    price_diff_absolute = abs(a_price - f_price)
                    
                    # Calculate a combined score based on both price and rating
                    # Normalize ratings to 0-10 scale if available
                    a_rating_norm = (a_rating / 5) * 10 if a_rating > 0 else 0
                    f_rating_norm = (f_rating / 5) * 10 if f_rating > 0 else 0
                    
                    # Price score: lower is better (0-10 scale, inverted)
                    # 10% price difference = ~2 points difference
                    a_price_score = 10 - (a_price / min(a_price, f_price) - 1) * 20 if a_price > 0 else 0
                    f_price_score = 10 - (f_price / min(a_price, f_price) - 1) * 20 if f_price > 0 else 0
                    
                    # Combined score (price is 60% of decision, rating is 40%)
                    a_score = (a_price_score * 0.6) + (a_rating_norm * 0.4)
                    f_score = (f_price_score * 0.6) + (f_rating_norm * 0.4)
                    
                    # Decision logic
                    if price_diff_percent < 3:  # Very similar prices (within 3%)
                        if abs(a_rating - f_rating) < 0.3:  # Very similar ratings too
                            # Almost identical offerings
                            if a_price < f_price:
                                better_platform = "amazon"
                                reason = f"Marginally better price (₹{a_price:.2f} vs ₹{f_price:.2f})"
                            else:
                                better_platform = "flipkart"
                                reason = f"Marginally better price (₹{f_price:.2f} vs ₹{a_price:.2f})"
                        else:
                            # Similar price but rating differs
                            if a_rating > f_rating:
                                better_platform = "amazon"
                                reason = f"Better rating ({a_rating} vs {f_rating}) with similar price"
                            else:
                                better_platform = "flipkart"
                                reason = f"Better rating ({f_rating} vs {a_rating}) with similar price"
                    elif price_diff_percent < 10:  # Moderate price difference (3-10%)
                        # Consider both price and rating
                        if a_score >= f_score:
                            better_platform = "amazon"
                            if a_rating > f_rating:
                                reason = f"Better value: Lower price (₹{a_price:.2f} vs ₹{f_price:.2f}) and higher rating"
                            else:
                                reason = f"Better value: Lower price (₹{a_price:.2f} vs ₹{f_price:.2f}) outweighs rating difference"
                        else:
                            better_platform = "flipkart"
                            if f_rating > a_rating:
                                reason = f"Better value: Lower price (₹{f_price:.2f} vs ₹{a_price:.2f}) and higher rating"
                            else:
                                reason = f"Better value: Lower price (₹{f_price:.2f} vs ₹{a_price:.2f}) outweighs rating difference"
                    else:
                        # Significant price difference (>10%)
                        if a_price < f_price:
                            # Check if a much better rating justifies higher price
                            if f_rating - a_rating > 1.5 and f_score > a_score:
                                better_platform = "flipkart"
                                reason = f"Much better rating ({f_rating} vs {a_rating}) justifies higher price"
                            else:
                                better_platform = "amazon"
                                reason = f"Significantly lower price: ₹{a_price:.2f} vs ₹{f_price:.2f} ({price_diff_percent:.1f}% cheaper)"
                        else:
                            # Check if a much better rating justifies higher price
                            if a_rating - f_rating > 1.5 and a_score > f_score:
                                better_platform = "amazon"
                                reason = f"Much better rating ({a_rating} vs {f_rating}) justifies higher price"
                            else:
                                better_platform = "flipkart"
                                reason = f"Significantly lower price: ₹{f_price:.2f} vs ₹{a_price:.2f} ({price_diff_percent:.1f}% cheaper)"
                
                recommendations.append({
                    'amazon_product': a_product,
                    'flipkart_product': best_match,
                    'better_platform': better_platform,
                    'reason': reason,
                    'similarity': highest_similarity
                })
        
        # For products without matches, add individual recommendations
        matched_amazon = set([r['amazon_product']['name'] for r in recommendations])
        matched_flipkart = set([r['flipkart_product']['name'] for r in recommendations])
        
        for a_product in amazon_products:
            if a_product['name'] not in matched_amazon:
                recommendations.append({
                    'amazon_product': a_product,
                    'flipkart_product': None,
                    'better_platform': 'amazon',
                    'reason': 'Only available on Amazon',
                    'similarity': 0
                })
        
        for f_product in flipkart_products:
            if f_product['name'] not in matched_flipkart:
                recommendations.append({
                    'amazon_product': None,
                    'flipkart_product': f_product,
                    'better_platform': 'flipkart',
                    'reason': 'Only available on Flipkart',
                    'similarity': 0
                })
        
        results['recommendations'] = recommendations
        
        return jsonify(results)
    else:
        return jsonify({
            "error": "No products found or scraping failed",
            "amazon_results": len(results['amazon']),
            "flipkart_results": len(results['flipkart'])
        }), 404

# compare_product()
@app.route('/visualization')
def visualization():
    # Return the visualization.html file directly
    with open('templates/visualization.html', 'r') as file:
        return file.read()

@app.route('/api/save-price', methods=['POST'])
def save_price():
    """
    Save a product's price to the database for price history tracking
    """
    data = request.json
    
    if not data or 'name' not in data or 'price' not in data or 'platform' not in data or 'url' not in data:
        return jsonify({"error": "Missing required product data"}), 400
    
    try:
        # Clean price string and convert to float
        price_str = data['price'].replace(',', '').replace('₹', '').strip()
        price = float(price_str) if price_str and price_str != 'Price not available' else 0
        
        # Check if product already exists
        product = Product.query.filter_by(product_url=data['url']).first()
        
        if not product:
            # Create new product
            product = Product(
                name=data['name'],
                platform=data['platform'],
                product_url=data['url']
            )
            db.session.add(product)
            db.session.commit()
        
        # Add price history entry
        price_entry = PriceHistory(
            product_id=product.id,
            price=price
        )
        db.session.add(price_entry)
        db.session.commit()
        
        return jsonify({"success": True, "message": "Price saved successfully"}), 200
    
    except Exception as e:
        db.session.rollback()
        print(f"Error saving price: {e}")
        return jsonify({"error": f"Failed to save price: {str(e)}"}), 500

@app.route('/api/price-history')
def get_price_history():
    """
    Get the price history for a product URL
    """
    product_url = request.args.get('url')
    
    if not product_url:
        return jsonify({"error": "Missing product URL parameter"}), 400
    
    try:
        # Find the product
        product = Product.query.filter_by(product_url=product_url).first()
        
        if not product:
            # No price history yet
            return jsonify({"product": None, "history": []}), 200
        
        # Get price history sorted by date
        history = PriceHistory.query.filter_by(product_id=product.id).order_by(PriceHistory.date).all()
        
        # Create history data for chart
        history_data = [
            {
                "date": entry.date.strftime("%Y-%m-%d"),
                "price": entry.price
            } for entry in history
        ]
        
        # If there's no real history yet, generate some sample data points
        # for the last 30 days to demonstrate the feature
        if len(history_data) <= 1:
            today = datetime.utcnow()
            # Get the current price
            current_price = history_data[0]["price"] if history_data else 0
            
            # Generate synthetic price history for demo purposes
            # with some realistic variations (±5%) around the current price
            import random
            
            history_data = []
            for i in range(30, 0, -1):
                date = today - timedelta(days=i)
                # Variation between 95% and 105% of current price
                price_variation = current_price * random.uniform(0.95, 1.05)
                history_data.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "price": round(price_variation, 2)
                })
            
            # Add current price
            history_data.append({
                "date": today.strftime("%Y-%m-%d"),
                "price": current_price
            })
        
        return jsonify({
            "product": {
                "id": product.id,
                "name": product.name,
                "platform": product.platform,
                "url": product.product_url
            },
            "history": history_data
        }), 200
    
    except Exception as e:
        print(f"Error getting price history: {e}")
        return jsonify({"error": f"Failed to get price history: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)
