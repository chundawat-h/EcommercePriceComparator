import re
results = {
    'amazon': [
        {
            'name': 'apple iphone 15 pro max (512 gb) - natural titanium',
            'price': '₹12,490',
            'rating': '4.2 out of 5 stars'
        },
        {
            'name': 'Redmi Note 13 (Arctic White, 8GB, 128GB)',
            'price': '₹14,999',
            'rating': '4.4 out of 5 stars'
        }
    ],
    'flipkart': [
        {
            'name': 'apple iphone (15 pro max) latest version ',
            'price': '₹12,199',
            'rating': '4.3 ★'
        },
        {
            'name': 'Realme Narzo N53 (Feather Black, 4GB, 64GB)',
            'price': '₹8,999',
            'rating': '4.1 ★'
        }
    ]
}

if results['amazon'] or results['flipkart']:
        # Find products that appear on both platforms by using fuzzy matching on names
        amazon_products = results['amazon']
        flipkart_products = results['flipkart']
        
        # Generate recommendations
        recommendations = []
        
        # Find close matches between the two platforms
        for a_product in amazon_products:
            print(type(a_product))
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
            print("aname", a_name)
            a_terms = extract_key_terms(a_name)
            print("terms", a_terms)
            a_term_set = set(a_terms)
            
            for f_product in flipkart_products:
                f_name = f_product['name'].lower()
                
                # Get key terms from Flipkart product
                print("fname", f_name)
                f_terms = extract_key_terms(f_name)
                print("fterms", f_terms)
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
            print(similarity)
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
        print(recommendations)
